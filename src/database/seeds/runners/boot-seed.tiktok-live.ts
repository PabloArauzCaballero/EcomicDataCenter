import { randomUUID } from 'node:crypto';
import type { Transaction } from 'sequelize';
import {
  ClaimEvidenceModel,
  FactClaimModel,
  RawObservationModel,
  SourceArtifactModel,
} from '../../models';
import { claimContentHash, rawPayloadHash } from '../../../common/intelligence/claim-normalizer';
import { canonicalHash, textHash } from '../../../common/hashing/canonical-hash';
import { reconcileHistoryRun } from './boot-seed.history-provenance';
import { roadHashesAlreadyHeld } from './boot-seed.bolivia-road-network';
import { tiktokLiveSchema, type TiktokLive } from '../schemas/tiktok-live.schema';
import { readSeed } from './seed.utils';

/**
 * Carga las ventas en vivo de TikTok observadas en Bolivia (ADR 0030).
 *
 * Cuatro clases de observación, ninguna con `measures`: lo que se ve en un live
 * no es una serie del país y no debe entrar a las vistas de indicadores. La
 * migración que abre `read_models.live_commerce_*` las lee por su categoría.
 *
 * - `LIVE_COMMERCE_ROOM`: un live observado, con sus conteos.
 * - `LIVE_COMMERCE_PRICES`: los precios de ese live, juntos.
 * - `LIVE_COMMERCE_COVERAGE`: cuánto se vio y cuánto quedó fuera, por noche.
 * - `LIVE_COMMERCE_SNAPSHOT`: frases, términos y catálogos del último análisis;
 *   las frases dependen de todo el corpus y se reemplazan enteras.
 *
 * Un análisis nuevo vuelve a escribir solo lo que cambió: lo idéntico tiene la
 * misma huella y se salta. Las vistas toman la lectura más reciente de cada live.
 * El artefacto es la noche de captura, por la huella de su descriptor: el chat y
 * la voz crudos no salen de la máquina del operador.
 */

const AGENT_CODE = 'LIVE_COMMERCE';
const CHUNK = 500;
const FILE = 'boot/tiktok-live.json';

interface Pending {
  readonly payload: Record<string, unknown>;
  readonly hash: string;
  readonly assertion: string;
  readonly eventDate: string;
  readonly night: string;
}

function pendingOf(seed: TiktokLive): Pending[] {
  const { runId, retrievedAt } = seed.provenance;
  const entries: Pending[] = [];
  const push = (
    payload: Record<string, unknown>,
    assertion: string,
    eventDate: string,
    night: string,
  ) => entries.push({ payload, hash: rawPayloadHash(payload), assertion, eventDate, night });

  for (const room of seed.rooms) {
    push(
      { recordType: 'LIVE_COMMERCE_ROOM', dataCategory: 'LIVE_COMMERCE_ROOM', ...room },
      `Live ${room.roomKey} (${room.rubro}) observado el ${room.date}: ${room.messages} mensajes en ${room.minutes} minutos.`,
      room.date,
      room.run,
    );
    const prices = seed.prices.filter((price) => price.roomKey === room.roomKey);
    if (prices.length === 0) continue;
    push(
      {
        recordType: 'LIVE_COMMERCE_PRICES',
        dataCategory: 'LIVE_COMMERCE_PRICES',
        roomKey: room.roomKey,
        date: room.date,
        prices,
      },
      `${prices.length} precios dichos o mostrados en el live ${room.roomKey} el ${room.date}.`,
      room.date,
      room.run,
    );
  }
  for (const night of seed.coverage) {
    push(
      { recordType: 'LIVE_COMMERCE_COVERAGE', dataCategory: 'LIVE_COMMERCE_COVERAGE', ...night },
      `Noche de captura ${night.run}: ${night.roomsOpened} lives abiertos, ${night.messages} mensajes leídos.`,
      night.run,
      night.run,
    );
  }
  push(
    {
      recordType: 'LIVE_COMMERCE_SNAPSHOT',
      dataCategory: 'LIVE_COMMERCE_SNAPSHOT',
      date: retrievedAt.slice(0, 10),
      provenance: seed.provenance,
      rubros: seed.rubros,
      departments: seed.departments,
      phrases: seed.phrases,
      terms: seed.terms,
    },
    `Frases y términos de las ventas en vivo, análisis del ${retrievedAt.slice(0, 10)} (${seed.provenance.runs.length} noches).`,
    retrievedAt.slice(0, 10),
    runId,
  );
  return entries;
}

async function reconcileArtifact(
  sourceId: string,
  night: string,
  seed: TiktokLive,
  transaction: Transaction,
): Promise<string> {
  const { collector } = seed.provenance;
  const sha256 = canonicalHash({ collector, night, dataset: FILE });
  const existing = await SourceArtifactModel.findOne({ where: { sha256 }, transaction });
  if (existing) return existing.sourceArtifactId;
  const sourceArtifactId = randomUUID();
  const uri = `${collector}#${night}`;
  await SourceArtifactModel.create(
    {
      sourceArtifactId,
      sourceId,
      artifactType: 'JSON',
      mimeType: 'application/json',
      originalUri: uri,
      storageUri: uri,
      sha256,
      publicationDate: null,
      retrievedAt: new Date(seed.provenance.retrievedAt),
      metadataJson: {
        publisher: 'Observatorio (captura de lives de TikTok)',
        dataset: FILE,
        retrievalStrategy: 'VERSIONED_SNAPSHOT_V1',
      },
    },
    { transaction },
  );
  return sourceArtifactId;
}

async function writeBlock(
  block: readonly Pending[],
  sourceArtifactId: string,
  agentRunId: string,
  retrievedAt: string,
  locator: string,
  transaction: Transaction,
): Promise<void> {
  const observations = await RawObservationModel.bulkCreate(
    block.map((entry) => ({
      agentRunId,
      sourceArtifactId,
      payloadJson: entry.payload,
      payloadHash: entry.hash,
      receivedAt: new Date(retrievedAt),
      processingStatus: 'NORMALIZED' as const,
      retryCount: 0,
    })),
    { transaction, returning: true },
  );
  const claims = block.map((entry, index) => ({
    factClaimId: randomUUID(),
    agentRunId,
    rawObservationId: observations[index]?.rawObservationId ?? '',
    claimType: 'INDICATOR_READING' as const,
    assertion: entry.assertion,
    eventDate: entry.eventDate,
    confidenceLevel: 'MEDIUM' as const,
    confidenceScore: '0.6000',
    impactLevel: 'LOW' as const,
    timeHorizon: 'SHORT_TERM' as const,
    status: 'PUBLISHED' as const,
    contentHash: claimContentHash({
      claimType: 'INDICATOR_READING',
      assertion: entry.assertion,
      eventDate: entry.eventDate,
    }),
    createdAt: new Date(),
  }));
  await FactClaimModel.bulkCreate(claims, { transaction });
  await ClaimEvidenceModel.bulkCreate(
    claims.map((claim) => ({
      factClaimId: claim.factClaimId,
      sourceArtifactId,
      excerpt: claim.assertion,
      excerptHash: textHash(claim.assertion),
      locator,
      retrievedAt: new Date(retrievedAt),
    })),
    { transaction },
  );
}

export async function reconcileTiktokLive(
  sourceId: string,
  transaction: Transaction,
): Promise<void> {
  const agentRunId = await reconcileHistoryRun(AGENT_CODE, transaction);
  const seed = await readSeed(FILE, tiktokLiveSchema);
  const entries = pendingOf(seed);
  const held = await roadHashesAlreadyHeld(
    entries.map((entry) => entry.hash),
    transaction,
  );
  const byNight = new Map<string, Pending[]>();
  for (const entry of entries) {
    if (held.has(entry.hash)) continue;
    held.add(entry.hash);
    byNight.set(entry.night, [...(byNight.get(entry.night) ?? []), entry]);
  }
  for (const [night, pending] of byNight) {
    const sourceArtifactId = await reconcileArtifact(sourceId, night, seed, transaction);
    for (let start = 0; start < pending.length; start += CHUNK) {
      await writeBlock(
        pending.slice(start, start + CHUNK),
        sourceArtifactId,
        agentRunId,
        seed.provenance.retrievedAt,
        `${seed.provenance.collector}#${night}`,
        transaction,
      );
    }
  }
}
