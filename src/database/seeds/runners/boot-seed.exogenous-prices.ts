import { randomUUID } from 'node:crypto';
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
import {
  exogenousPricesSchema,
  type ExogenousPoint,
  type ExogenousSeries,
} from '../schemas/exogenous-prices.schema';
import { readSeed } from './seed.utils';

/**
 * Carga los precios que Bolivia no fija.
 *
 * Cada cifra es una observación, una afirmación y una evidencia, como un tramo
 * de carretera, y por la misma razón NO lleva el arreglo `measures`: sin él la
 * lectura no entra a `economic_indicator_reading` y por tanto tampoco a la
 * vista diaria —que la portada lee entera en cada visita y que en el servidor
 * chico ya va justa— ni a la anual, que archivaría estos códigos en `OTROS`.
 * La migración 0086 abre su propia vista, `read_models.exogenous_price`.
 *
 * La huella del registro no lleva la hora de descarga ni la dirección: una
 * recolección que vuelve a traer el mismo mes con la misma cifra es la misma
 * lectura. Si el publicador revisa una cifra, la huella cambia y entra una
 * fila nueva; la vista se queda con la recibida más tarde.
 */

const AGENT_CODE = 'EXOGENOUS_PRICES';
const CHUNK = 500;
const FILES = ['boot/exogenous-prices.json', 'boot/exogenous-customs.json'] as const;

interface Pending {
  readonly series: ExogenousSeries;
  readonly point: ExogenousPoint;
  readonly payload: Record<string, unknown>;
  readonly hash: string;
  readonly sourceUrl: string;
  readonly sha256: string;
  readonly retrievedAt: string;
}

function payloadOf(series: ExogenousSeries, point: ExogenousPoint): Record<string, unknown> {
  return {
    recordType: 'EXOGENOUS_PRICE',
    dataCategory: 'EXOGENOUS_PRICE',
    indicatorCode: series.indicatorCode,
    group: series.group,
    product: series.product,
    productLabel: series.productLabel,
    name: series.name,
    scope: series.scope,
    market: series.market,
    unit: series.unit,
    kind: series.kind,
    frequency: series.frequency,
    publisher: series.publisher,
    note: series.note,
    period: point.period,
    value: point.value,
    ...(point.tradeValueUsd ? { tradeValueUsd: point.tradeValueUsd } : {}),
    ...(point.netWeightKg ? { netWeightKg: point.netWeightKg } : {}),
  };
}

const eventDateOf = (period: string): string =>
  period.length === 4 ? `${period}-01-01` : `${period}-01`;

function assertionOf(series: ExogenousSeries, point: ExogenousPoint): string {
  const when = `en ${point.period}`;
  if (point.tradeValueUsd && point.netWeightKg) {
    return `${series.name}: ${point.value} ${series.unit} ${when} (${point.tradeValueUsd} US$ entre ${point.netWeightKg} kg).`;
  }
  return `${series.name} (${series.market}): ${point.value} ${series.unit} ${when}.`;
}

function pendingOf(series: ExogenousSeries, point: ExogenousPoint): Pending {
  const payload = payloadOf(series, point);
  const sourceUrl = point.sourceUrl ?? series.provenance?.sourceUrl ?? '';
  const sha256 = point.upstreamSha256 ?? series.provenance?.upstreamSha256 ?? '';
  const retrievedAt = point.retrievedAt ?? series.provenance?.retrievedAt ?? '';
  return { series, point, payload, hash: rawPayloadHash(payload), sourceUrl, sha256, retrievedAt };
}

/** El formato de la descarga, por su dirección: cuaderno, texto separado o JSON. */
function formatOf(url: string): { artifactType: string; mimeType: string } {
  if (url.endsWith('.xlsx')) {
    return {
      artifactType: 'XLSX',
      mimeType: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
    };
  }
  if (url.includes('fredgraph.csv')) return { artifactType: 'CSV', mimeType: 'text/csv' };
  return { artifactType: 'JSON', mimeType: 'application/json' };
}

async function reconcileArtifact(
  sourceId: string,
  sha256: string,
  first: Pending,
  file: string,
  transaction: Transaction,
): Promise<string> {
  const existing = await SourceArtifactModel.findOne({ where: { sha256 }, transaction });
  if (existing) return existing.sourceArtifactId;
  const sourceArtifactId = randomUUID();
  await SourceArtifactModel.create(
    {
      sourceArtifactId,
      sourceId,
      ...formatOf(first.sourceUrl),
      originalUri: first.sourceUrl,
      storageUri: first.sourceUrl,
      sha256,
      publicationDate: null,
      retrievedAt: new Date(first.retrievedAt),
      metadataJson: {
        publisher: first.series.publisher,
        dataset: file,
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
      receivedAt: new Date(entry.retrievedAt),
      processingStatus: 'NORMALIZED' as const,
      retryCount: 0,
    })),
    { transaction, returning: true },
  );
  const claims = block.map((entry, index) => {
    const assertion = assertionOf(entry.series, entry.point);
    const eventDate = eventDateOf(entry.point.period);
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
      const excerpt = entry?.point.excerpt ?? claim.assertion;
      return {
        factClaimId: claim.factClaimId,
        sourceArtifactId,
        excerpt,
        excerptHash: textHash(excerpt),
        locator: entry?.sourceUrl ?? '',
        retrievedAt: new Date(entry?.retrievedAt ?? Date.now()),
      };
    }),
    { transaction },
  );
}

export async function reconcileExogenousPrices(
  sourceId: string,
  transaction: Transaction,
): Promise<void> {
  const agentRunId = await reconcileHistoryRun(AGENT_CODE, transaction);
  for (const file of FILES) {
    const seed = await readSeed(file, exogenousPricesSchema);
    const entries = seed.series.flatMap((series) =>
      series.points.map((point) => pendingOf(series, point)),
    );
    const held = await roadHashesAlreadyHeld(
      entries.map((entry) => entry.hash),
      transaction,
    );

    // Una descarga es un artefacto: el cuaderno del Banco Mundial trae cuarenta
    // series y entra una vez, no cuarenta.
    const byArtifact = new Map<string, Pending[]>();
    for (const entry of entries) {
      if (held.has(entry.hash)) continue;
      held.add(entry.hash);
      const own = byArtifact.get(entry.sha256);
      if (own) own.push(entry);
      else byArtifact.set(entry.sha256, [entry]);
    }

    for (const [sha256, pending] of byArtifact) {
      const first = pending[0];
      if (!first) continue;
      const sourceArtifactId = await reconcileArtifact(sourceId, sha256, first, file, transaction);
      for (let start = 0; start < pending.length; start += CHUNK) {
        await writeBlock(
          pending.slice(start, start + CHUNK),
          sourceArtifactId,
          agentRunId,
          transaction,
        );
      }
    }
  }
}
