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
  bankVirtualAssetsSchema,
  type BankPoint,
  type BankSeries,
} from '../schemas/bank-virtual-assets.schema';
import { readSeed } from './seed.utils';

/**
 * Carga los servicios de dólar digital de los bancos bolivianos.
 *
 * Cada punto es una observación, una afirmación y una evidencia, y NO lleva el
 * arreglo `measures`: sin él la lectura no entra a `economic_indicator_reading`
 * ni por tanto a la vista diaria que la portada lee entera, y la migración 0089
 * abre su propia vista, `read_models.bank_virtual_asset`.
 *
 * La huella lleva la fecha: una lectura diaria que sale igual que ayer es OTRA
 * lectura, porque la serie es justamente eso, un día tras otro. Lo que no
 * cambia es la de un mismo día vuelto a recoger con la misma cifra.
 */

const AGENT_CODE = 'BANK_VIRTUAL_ASSETS';
const CHUNK = 500;
const FILE = 'boot/bank-virtual-assets.json';

interface Pending {
  readonly series: BankSeries;
  readonly point: BankPoint;
  readonly payload: Record<string, unknown>;
  readonly hash: string;
}

function payloadOf(series: BankSeries, point: BankPoint): Record<string, unknown> {
  return {
    recordType: 'BANK_VIRTUAL_ASSET',
    dataCategory: 'BANK_VIRTUAL_ASSET',
    indicatorCode: series.indicatorCode,
    bank: series.bank,
    bankName: series.bankName,
    product: series.product,
    asset: series.asset,
    kind: series.kind,
    ...(series.limit ? { limit: series.limit } : {}),
    unit: series.unit,
    note: series.note,
    date: point.date,
    value: point.value,
    basis: point.basis,
  };
}

function assertionOf(series: BankSeries, point: BankPoint): string {
  if (series.kind === 'OFFERED') {
    const state = point.value === '1' ? 'ofrece' : 'ya no anuncia';
    return `${series.bankName} ${state} ${series.product} (${series.asset}) el ${point.date}.`;
  }
  return `${series.bankName}, ${series.product}: ${series.limit ?? 'límite'} de ${point.value} ${series.unit} el ${point.date}.`;
}

function pendingOf(series: BankSeries, point: BankPoint): Pending {
  const payload = payloadOf(series, point);
  return { series, point, payload, hash: rawPayloadHash(payload) };
}

async function reconcileArtifact(
  sourceId: string,
  first: Pending,
  transaction: Transaction,
): Promise<string> {
  const { point, series } = first;
  const existing = await SourceArtifactModel.findOne({
    where: { sha256: point.upstreamSha256 },
    transaction,
  });
  if (existing) return existing.sourceArtifactId;
  const sourceArtifactId = randomUUID();
  await SourceArtifactModel.create(
    {
      sourceArtifactId,
      sourceId,
      artifactType: 'HTML',
      mimeType: 'text/html',
      originalUri: point.sourceUrl,
      storageUri: point.sourceUrl,
      sha256: point.upstreamSha256,
      publicationDate: null,
      retrievedAt: new Date(point.retrievedAt),
      metadataJson: {
        publisher: series.bankName,
        dataset: FILE,
        basis: point.basis,
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
      receivedAt: new Date(entry.point.retrievedAt),
      processingStatus: 'NORMALIZED' as const,
      retryCount: 0,
    })),
    { transaction, returning: true },
  );
  const claims = block.map((entry, index) => {
    const assertion = assertionOf(entry.series, entry.point);
    const eventDate = entry.point.date;
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
        locator: entry?.point.sourceUrl ?? '',
        retrievedAt: new Date(entry?.point.retrievedAt ?? Date.now()),
      };
    }),
    { transaction },
  );
}

export async function reconcileBankVirtualAssets(
  sourceId: string,
  transaction: Transaction,
): Promise<void> {
  const agentRunId = await reconcileHistoryRun(AGENT_CODE, transaction);
  const seed = await readSeed(FILE, bankVirtualAssetsSchema);
  const entries = seed.series.flatMap((series) =>
    series.points.map((point) => pendingOf(series, point)),
  );
  const held = await roadHashesAlreadyHeld(
    entries.map((entry) => entry.hash),
    transaction,
  );

  // Una descarga es un artefacto: lo que dos series leen de una misma página
  // entra una vez.
  const byArtifact = new Map<string, Pending[]>();
  for (const entry of entries) {
    if (held.has(entry.hash)) continue;
    held.add(entry.hash);
    const own = byArtifact.get(entry.point.upstreamSha256);
    if (own) own.push(entry);
    else byArtifact.set(entry.point.upstreamSha256, [entry]);
  }

  for (const pending of byArtifact.values()) {
    const first = pending[0];
    if (!first) continue;
    const sourceArtifactId = await reconcileArtifact(sourceId, first, transaction);
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
