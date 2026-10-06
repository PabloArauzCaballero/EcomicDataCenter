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
import { tiktokVideosSchema, type TiktokVideos } from '../schemas/tiktok-videos.schema';
import { readSeed } from './seed.utils';

/**
 * Carga los videos de los vendedores de lives y de las cuentas parecidas (ADR 0031), aparte de los
 * lives. Dos clases de observación, sin `measures`:
 *
 * - `TIKTOK_VIDEO_ACCOUNT`: una cuenta con sus videos leídos en esa corrida.
 * - `TIKTOK_VIDEO_SNAPSHOT`: hashtags, catálogos y cobertura del último análisis.
 *
 * Lo idéntico tiene la misma huella y se salta; las vistas toman la lectura más reciente de cada
 * cuenta. Lo publica el mismo agente que los lives: es la misma familia de recolección.
 */

const AGENT_CODE = 'LIVE_COMMERCE';
const CHUNK = 200;
const FILE = 'boot/tiktok-videos.json';

interface Pending {
  readonly payload: Record<string, unknown>;
  readonly hash: string;
  readonly assertion: string;
  readonly eventDate: string;
}

function pendingOf(seed: TiktokVideos): Pending[] {
  const { retrievedAt } = seed.provenance;
  const date = retrievedAt.slice(0, 10);
  const byAccount = new Map<string, TiktokVideos['videos']>();
  for (const video of seed.videos) {
    byAccount.set(video.sellerId, [...(byAccount.get(video.sellerId) ?? []), video]);
  }
  const entries: Pending[] = seed.accounts.map((account) => {
    const payload = {
      recordType: 'TIKTOK_VIDEO_ACCOUNT',
      dataCategory: 'TIKTOK_VIDEO_ACCOUNT',
      date,
      ...account,
      videos: byAccount.get(account.sellerId) ?? [],
    };
    return {
      payload,
      hash: rawPayloadHash(payload),
      assertion: `Cuenta ${account.sellerId} (${account.kind}, ${account.rubro}): ${account.videosRead} videos leídos el ${date}.`,
      eventDate: date,
    };
  });
  const snapshot = {
    recordType: 'TIKTOK_VIDEO_SNAPSHOT',
    dataCategory: 'TIKTOK_VIDEO_SNAPSHOT',
    date,
    provenance: seed.provenance,
    rubros: seed.rubros,
    departments: seed.departments,
    terms: seed.terms,
    coverage: seed.coverage,
  };
  entries.push({
    payload: snapshot,
    hash: rawPayloadHash(snapshot),
    assertion: `Videos de vendedores de TikTok: ${seed.coverage.videos} videos de ${seed.coverage.accountsIncluded} cuentas, análisis del ${date}.`,
    eventDate: date,
  });
  return entries;
}

async function reconcileArtifact(
  sourceId: string,
  seed: TiktokVideos,
  transaction: Transaction,
): Promise<string> {
  const { collector, runId, retrievedAt } = seed.provenance;
  const sha256 = canonicalHash({ collector, runId, dataset: FILE });
  const existing = await SourceArtifactModel.findOne({ where: { sha256 }, transaction });
  if (existing) return existing.sourceArtifactId;
  const sourceArtifactId = randomUUID();
  const uri = `${collector}#${runId}`;
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
      retrievedAt: new Date(retrievedAt),
      metadataJson: {
        publisher: 'Observatorio (perfiles públicos de TikTok)',
        dataset: FILE,
        retrievalStrategy: 'VERSIONED_SNAPSHOT_V1',
      },
    },
    { transaction },
  );
  return sourceArtifactId;
}

export async function reconcileTiktokVideos(
  sourceId: string,
  transaction: Transaction,
): Promise<void> {
  const agentRunId = await reconcileHistoryRun(AGENT_CODE, transaction);
  const seed = await readSeed(FILE, tiktokVideosSchema);
  const entries = pendingOf(seed);
  const held = await roadHashesAlreadyHeld(
    entries.map((entry) => entry.hash),
    transaction,
  );
  const fresh = entries.filter((entry) => !held.has(entry.hash));
  if (!fresh.length) return;
  const sourceArtifactId = await reconcileArtifact(sourceId, seed, transaction);
  const retrievedAt = new Date(seed.provenance.retrievedAt);
  const locator = `${seed.provenance.collector}#${seed.provenance.runId}`;
  for (let start = 0; start < fresh.length; start += CHUNK) {
    const block = fresh.slice(start, start + CHUNK);
    const observations = await RawObservationModel.bulkCreate(
      block.map((entry) => ({
        agentRunId,
        sourceArtifactId,
        payloadJson: entry.payload,
        payloadHash: entry.hash,
        receivedAt: retrievedAt,
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
        retrievedAt,
      })),
      { transaction },
    );
  }
}
