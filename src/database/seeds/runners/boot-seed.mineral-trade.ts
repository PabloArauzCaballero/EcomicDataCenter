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
import { mineralTradeSchema, type MineralTradeSeries } from '../schemas/mineral-trade.schema';
import { readSeed } from './seed.utils';

/**
 * Carga lo que Bolivia declaró exportar de cada mineral, en plata y en kilos.
 *
 * El observatorio contaba el comercio exterior en una sola cifra y las rentas
 * del subsuelo en porcentaje del PIB. Ninguna de las dos dice cuánto zinc, ni
 * cuánto oro, ni cuánto litio, y la pregunta por los minerales en el tiempo no
 * tenía dónde contestarse. Estas series son la declaración aduanera partida por
 * partida, que es el único registro público que las distingue.
 *
 * Cada año es su propio artefacto porque cada año fue su propia petición —igual
 * que en el comercio total—, pero aquí una petición trae **todas** las partidas
 * del año: quince productos comparten dirección y huella. El artefacto se
 * concilia por esa huella, así que la descarga de un año entra una vez aunque
 * la citen treinta series. Eso no es un atajo, es lo que de verdad pasó.
 */

const AGENT_CODE = 'MINERAL_TRADE_BACKFILL';

type MineralPoint = MineralTradeSeries['points'][number];

async function reconcilePointArtifact(
  series: MineralTradeSeries,
  point: MineralPoint,
  sourceId: string,
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
      metadataJson: {
        publisher: series.publisher,
        indicatorCode: series.indicatorCode,
        hsCode: series.hsCode,
        indicatorName: series.name,
        frequency: series.frequency,
        period: point.period,
        retrievalStrategy: 'VERSIONED_SNAPSHOT_V1',
      },
    },
    { transaction },
  );
  return sourceArtifactId;
}

/**
 * La carga de un año.
 *
 * `eventDate` cierra el año en vez de abrirlo, por la misma razón que cualquier
 * otra cifra anual de este corpus: un total de un año sólo se conoce cuando el
 * año terminó, y quien ordene por fecha no debería encontrárselo antes.
 */
function annualPayload(series: MineralTradeSeries, point: MineralPoint): Record<string, unknown> {
  return {
    recordType: 'PERIOD_INDICATOR',
    dataCategory: 'FOREIGN_TRADE',
    eventDate: `${point.period}-12-31`,
    period: point.period,
    frequency: series.frequency,
    measures: [
      {
        indicatorCode: series.indicatorCode,
        priceSide: null,
        value: point.value,
        unit: series.unit,
      },
    ],
    indicatorName: series.name,
    compilerCode: `HS_${series.hsCode}_X`,
    publisher: series.publisher,
    publisherVerified: true,
    url: point.sourceUrl,
    sha256: point.upstreamSha256,
    storageUri: point.sourceUrl,
  };
}

async function reconcilePoint(
  series: MineralTradeSeries,
  point: MineralPoint,
  sourceId: string,
  agentRunId: string,
  transaction: Transaction,
): Promise<void> {
  const payload = annualPayload(series, point);
  const payloadHash = rawPayloadHash(payload);
  const present = await RawObservationModel.findOne({
    attributes: ['rawObservationId'],
    where: { payloadHash },
    transaction,
  });
  if (present) return;

  // La misma regla que aplica la vía de ingesta: una cifra ausente del registro
  // que se guarda como prueba no es una lectura.
  const measures = (payload as { measures: Parameters<typeof ungroundedMeasures>[0] }).measures;
  const ungrounded = ungroundedMeasures(measures, point.excerpt);
  if (ungrounded.length) {
    throw new Error(
      `${series.indicatorCode} ${point.period}: cifras ausentes del registro citado: ${ungrounded.join(', ')}`,
    );
  }

  const sourceArtifactId = await reconcilePointArtifact(series, point, sourceId, transaction);
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

  const assertion = `${series.name} en ${point.period}: ${point.value} ${series.unit}, segun ${series.publisher}.`;
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

export async function reconcileMineralTrade(
  sourceId: string,
  transaction: Transaction,
): Promise<void> {
  const history = await readSeed('boot/mineral-trade.json', mineralTradeSchema);
  const agentRunId = await reconcileHistoryRun(AGENT_CODE, transaction);
  for (const series of history.series) {
    for (const point of series.points) {
      await reconcilePoint(series, point, sourceId, agentRunId, transaction);
    }
  }
}
