import { randomUUID } from 'node:crypto';
import { readdir } from 'node:fs/promises';
import { resolve } from 'node:path';
import type { Transaction } from 'sequelize';
import {
  ClaimEvidenceModel,
  FactClaimModel,
  RawObservationModel,
  SourceArtifactModel,
} from '../../models';
import { claimContentHash, rawPayloadHash } from '../../../common/intelligence/claim-normalizer';
import { textHash } from '../../../common/hashing/canonical-hash';
import { reconcileHistoryRun } from './boot-seed.history-provenance';
import { roadHashesAlreadyHeld } from './boot-seed.bolivia-road-network';
import { publicAccountsSchema, type AccountSeries } from '../schemas/public-accounts.schema';
import { readSeed } from './seed.utils';

/**
 * Carga las cuentas públicas: recaudación, ingresos y gastos del Estado, deuda y subsidios.
 *
 * Son cientos de series y pocos miles de puntos, y ninguno se cita suelto: cada serie entra
 * como UN bloque con su afirmación y su evidencia, y lo que se cita es el cuaderno o la
 * consulta por su huella y la fila o la clave exactas. Una observación por serie, con los
 * puntos dentro, porque a diferencia de las estadísticas del Banco Central el conjunto es
 * pequeño: leer el nombre de una serie descomprime sus cien meses y es barato.
 *
 * Sin arreglo `measures`, como las estadísticas del Banco Central y los precios exógenos:
 * estas lecturas no son series del panel diario ni del anual y no deben entrar en ellos.
 * Así el panel de «Series de Bolivia» no se llena de cuatrocientas series que su selector
 * no sabe mostrar.
 *
 * Un cuaderno que el Ministerio revisa trae las mismas series con algún punto distinto; la
 * huella del bloque cambia y entra como bloque nuevo. La vista se queda con el recibido más
 * tarde y el anterior queda como evidencia de lo que se publicó.
 */

const AGENT_CODE = 'PUBLIC_ACCOUNTS';
const DIRECTORY = 'boot/public-accounts';
const CHUNK = 200;

interface Pending {
  readonly series: AccountSeries;
  readonly payload: Record<string, unknown>;
  readonly hash: string;
}

function payloadOf(series: AccountSeries): Record<string, unknown> {
  return {
    recordType: 'PUBLIC_ACCOUNT_SERIES',
    dataCategory: 'PUBLIC_ACCOUNT_SERIES',
    indicatorCode: series.indicatorCode,
    name: series.name,
    family: series.family,
    topic: series.topic,
    place: series.place,
    concept: series.concept,
    perimeter: series.perimeter,
    unit: series.unit,
    frequency: series.frequency,
    publisher: series.publisher,
    locator: series.locator,
    points: series.points,
  };
}

function pendingOf(series: AccountSeries): Pending {
  const payload = payloadOf(series);
  return { series, payload, hash: rawPayloadHash(payload) };
}

function assertionOf(entry: Pending): string {
  const { series } = entry;
  const first = series.points[0]?.[0];
  const last = series.points.at(-1)?.[0];
  // La huella de los puntos va en la afirmación: dos revisiones con el mismo nombre y el
  // mismo rango de fechas dirían lo mismo y la segunda se tomaría por repetida.
  return `${series.publisher}: ${series.name}, ${series.points.length} puntos de ${first} a ${last} [${entry.hash.slice(0, 12)}].`;
}

function excerptOf(series: AccountSeries): string {
  const first = series.points[0];
  const last = series.points.at(-1);
  return `Fuente ${series.sourceUrl}, ${JSON.stringify(series.locator)}: ${first?.[0]} = ${first?.[1]}; ${last?.[0]} = ${last?.[1]}`;
}

async function reconcileArtifact(
  sourceId: string,
  series: AccountSeries,
  transaction: Transaction,
): Promise<string> {
  const existing = await SourceArtifactModel.findOne({
    where: { sha256: series.upstreamSha256 },
    transaction,
  });
  if (existing) return existing.sourceArtifactId;
  const sourceArtifactId = randomUUID();
  const isSheet = /\.xlsx?(?:$|\?)/iu.test(series.sourceUrl);
  const isCsv = /format=csv/iu.test(series.sourceUrl);
  await SourceArtifactModel.create(
    {
      sourceArtifactId,
      sourceId,
      artifactType: isSheet ? 'XLSX' : isCsv ? 'CSV' : 'JSON',
      mimeType: isSheet
        ? 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet'
        : isCsv
          ? 'text/csv'
          : 'application/json',
      originalUri: series.sourceUrl,
      storageUri: series.sourceUrl,
      sha256: series.upstreamSha256,
      publicationDate: null,
      retrievedAt: new Date(series.retrievedAt),
      metadataJson: {
        publisher: series.publisher,
        dataset: series.family,
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
  transaction: Transaction,
): Promise<void> {
  const observations = await RawObservationModel.bulkCreate(
    block.map((entry) => ({
      agentRunId,
      sourceArtifactId,
      payloadJson: entry.payload,
      payloadHash: entry.hash,
      receivedAt: new Date(entry.series.retrievedAt),
      processingStatus: 'NORMALIZED' as const,
      retryCount: 0,
    })),
    { transaction, returning: true },
  );
  const claims = block.map((entry, index) => {
    const assertion = assertionOf(entry);
    const eventDate = entry.series.points.at(-1)?.[0] ?? '';
    return {
      factClaimId: randomUUID(),
      agentRunId,
      rawObservationId: observations[index]?.rawObservationId ?? '',
      claimType: 'INDICATOR_READING' as const,
      assertion,
      eventDate,
      confidenceLevel: 'HIGH' as const,
      confidenceScore: '0.9000',
      impactLevel: 'MEDIUM' as const,
      timeHorizon: 'SHORT_TERM' as const,
      status: 'PUBLISHED' as const,
      contentHash: claimContentHash({ claimType: 'INDICATOR_READING', assertion, eventDate }),
      createdAt: new Date(),
    };
  });
  await FactClaimModel.bulkCreate(claims, { transaction });
  await ClaimEvidenceModel.bulkCreate(
    claims.map((claim, index) => {
      const entry = block[index];
      const excerpt = entry ? excerptOf(entry.series) : claim.assertion;
      return {
        factClaimId: claim.factClaimId,
        sourceArtifactId,
        excerpt,
        excerptHash: textHash(excerpt),
        locator: entry?.series.sourceUrl ?? '',
        retrievedAt: new Date(entry?.series.retrievedAt ?? Date.now()),
      };
    }),
    { transaction },
  );
}

export async function reconcilePublicAccounts(
  sourceId: string,
  transaction: Transaction,
): Promise<void> {
  const agentRunId = await reconcileHistoryRun(AGENT_CODE, transaction);
  const names = (await readdir(resolve(__dirname, '..', DIRECTORY)))
    .filter((name) => name.endsWith('.json') && !name.startsWith('_'))
    .sort();
  for (const name of names) {
    const seed = await readSeed(`${DIRECTORY}/${name}`, publicAccountsSchema);
    const entries = seed.series.map(pendingOf);
    const held = await roadHashesAlreadyHeld(
      entries.map((entry) => entry.hash),
      transaction,
    );

    // Una serie nace de uno o varios cuadernos; entra bajo el artefacto de su última lectura.
    const byArtifact = new Map<string, Pending[]>();
    for (const entry of entries) {
      if (held.has(entry.hash)) continue;
      held.add(entry.hash);
      const own = byArtifact.get(entry.series.upstreamSha256);
      if (own) own.push(entry);
      else byArtifact.set(entry.series.upstreamSha256, [entry]);
    }
    for (const pending of byArtifact.values()) {
      const first = pending[0];
      if (!first) continue;
      const sourceArtifactId = await reconcileArtifact(sourceId, first.series, transaction);
      for (let start = 0; start < pending.length; start += CHUNK) {
        await writeBlock(pending.slice(start, start + CHUNK), sourceArtifactId, agentRunId, transaction);
      }
    }
  }
}
