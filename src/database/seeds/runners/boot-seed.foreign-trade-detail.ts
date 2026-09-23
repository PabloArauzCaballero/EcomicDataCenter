import { createHash, randomUUID } from 'node:crypto';
import type { Transaction } from 'sequelize';
import {
  ClaimEvidenceModel,
  FactClaimModel,
  RawObservationModel,
  SourceArtifactModel,
} from '../../models';
import { reconcileHistoryRun } from './boot-seed.history-provenance';
import { claimContentHash, rawPayloadHash } from '../../../common/intelligence/claim-normalizer';
import { ungroundedMeasures } from '../../../common/economic-indicators/indicator-codes';
import {
  foreignTradePartnersSchema,
  foreignTradeProductsSchema,
  type ForeignTradePartnerSeries,
  type ForeignTradeProductSeries,
} from '../schemas/foreign-trade-detail.schema';
import { readSeed } from './seed.utils';

/**
 * Carga el comercio exterior declarado, por socio y por producto.
 *
 * `foreign-trade` ya carga el total nacional; esto es el mismo registro visto
 * con otro corte. Dos archivos y un solo sembrador porque comparten forma —un
 * punto por año, con su propia procedencia— y difieren sólo en qué dimensión
 * identifica la serie: el país socio en uno, el capítulo arancelario en el
 * otro. Cada punto se concilia por la huella del año que lo trajo, igual que
 * en `mineral-trade`: varias series comparten una misma petición.
 */

const AGENT_CODE = 'FOREIGN_TRADE_DETAIL_BACKFILL';

type PartnerPoint = ForeignTradePartnerSeries['points'][number];
type ProductPoint = ForeignTradeProductSeries['points'][number];

async function reconcileArtifact(
  point: PartnerPoint | ProductPoint,
  sourceId: string,
  metadata: Record<string, unknown>,
  transaction: Transaction,
): Promise<string> {
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
      artifactType: 'JSON',
      originalUri: point.sourceUrl,
      storageUri: point.sourceUrl,
      mimeType: 'application/json',
      sha256: point.upstreamSha256,
      retrievedAt: new Date(point.retrievedAt),
      metadataJson: { ...metadata, retrievalStrategy: 'VERSIONED_SNAPSHOT_V1' },
    },
    { transaction },
  );
  return sourceArtifactId;
}

function payloadFor(
  indicatorCode: string,
  compilerCode: string,
  name: string,
  publisher: string,
  point: PartnerPoint | ProductPoint,
): Record<string, unknown> {
  return {
    recordType: 'PERIOD_INDICATOR',
    dataCategory: 'FOREIGN_TRADE',
    eventDate: `${point.period}-12-31`,
    period: point.period,
    frequency: 'ANNUAL',
    measures: [{ indicatorCode, priceSide: null, value: point.value, unit: 'USD' }],
    indicatorName: name,
    compilerCode,
    publisher,
    publisherVerified: true,
    url: point.sourceUrl,
    sha256: point.upstreamSha256,
    storageUri: point.sourceUrl,
  };
}

async function reconcilePoint(
  point: PartnerPoint | ProductPoint,
  indicatorCode: string,
  compilerCode: string,
  name: string,
  publisher: string,
  artifactMetadata: Record<string, unknown>,
  sourceId: string,
  agentRunId: string,
  transaction: Transaction,
): Promise<void> {
  const payload = payloadFor(indicatorCode, compilerCode, name, publisher, point);
  const payloadHash = rawPayloadHash(payload);
  const present = await RawObservationModel.findOne({
    attributes: ['rawObservationId'],
    where: { payloadHash },
    transaction,
  });
  if (present) return;

  const measures = (payload as { measures: Parameters<typeof ungroundedMeasures>[0] }).measures;
  const ungrounded = ungroundedMeasures(measures, point.excerpt);
  if (ungrounded.length) {
    throw new Error(
      `${indicatorCode} ${point.period}: cifras ausentes del registro citado: ${ungrounded.join(', ')}`,
    );
  }

  const sourceArtifactId = await reconcileArtifact(point, sourceId, artifactMetadata, transaction);
  const observation = await RawObservationModel.create(
    {
      agentRunId,
      sourceArtifactId,
      payloadJson: payload,
      payloadHash,
      receivedAt: new Date(point.retrievedAt),
      processingStatus: 'NORMALIZED',
      retryCount: 0,
    },
    { transaction },
  );

  const assertion = `${name} en ${point.period}: ${point.value} USD, segun ${publisher}.`;
  const eventDate = `${point.period}-12-31`;
  const factClaimId = randomUUID();
  await FactClaimModel.create(
    {
      factClaimId,
      agentRunId,
      rawObservationId: observation.rawObservationId,
      claimType: 'INDICATOR_READING',
      assertion,
      eventDate,
      confidenceLevel: 'HIGH',
      confidenceScore: '0.9000',
      impactLevel: 'HIGH',
      timeHorizon: 'STRUCTURAL',
      status: 'PUBLISHED',
      contentHash: claimContentHash({ claimType: 'INDICATOR_READING', assertion, eventDate }),
      createdAt: new Date(),
    },
    { transaction },
  );

  await ClaimEvidenceModel.create(
    {
      factClaimId,
      sourceArtifactId,
      excerpt: point.excerpt,
      excerptHash: createHash('sha256').update(point.excerpt).digest('hex'),
      locator: point.sourceUrl,
      retrievedAt: new Date(point.retrievedAt),
    },
    { transaction },
  );
}

export async function reconcileForeignTradeDetail(
  sourceId: string,
  transaction: Transaction,
): Promise<void> {
  const agentRunId = await reconcileHistoryRun(AGENT_CODE, transaction);

  const partners = await readSeed('boot/foreign-trade-partners.json', foreignTradePartnersSchema);
  for (const series of partners.series) {
    const compilerCode = `PARTNER_${series.flowCode}_${series.partnerCode}`;
    for (const point of series.points) {
      await reconcilePoint(
        point,
        series.indicatorCode,
        compilerCode,
        series.name,
        series.publisher,
        {
          publisher: series.publisher,
          indicatorCode: series.indicatorCode,
          compilerCode,
          indicatorName: series.name,
          frequency: series.frequency,
          period: point.period,
          partnerCode: series.partnerCode,
          partnerName: series.partnerName,
        },
        sourceId,
        agentRunId,
        transaction,
      );
    }
  }

  const products = await readSeed('boot/foreign-trade-products.json', foreignTradeProductsSchema);
  for (const series of products.series) {
    const compilerCode = `PRODUCT_${series.flowCode}_HS${series.hsCode}`;
    for (const point of series.points) {
      await reconcilePoint(
        point,
        series.indicatorCode,
        compilerCode,
        series.name,
        series.publisher,
        {
          publisher: series.publisher,
          indicatorCode: series.indicatorCode,
          compilerCode,
          indicatorName: series.name,
          frequency: series.frequency,
          period: point.period,
          hsCode: series.hsCode,
          hsName: series.hsName,
        },
        sourceId,
        agentRunId,
        transaction,
      );
    }
  }
}
