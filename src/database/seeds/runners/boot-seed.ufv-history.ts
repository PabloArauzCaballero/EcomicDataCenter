import { createHash, randomUUID } from 'node:crypto';
import { Op, type Transaction } from 'sequelize';
import {
  ClaimEvidenceModel,
  FactClaimModel,
  RawObservationModel,
  SourceArtifactModel,
} from '../../models';
import { reconcileHistoryRun } from './boot-seed.history-provenance';
import { claimContentHash, rawPayloadHash } from '../../../common/intelligence/claim-normalizer';
import { ufvHistorySchema, type UfvPoint, type UfvYear } from '../schemas/ufv-history.schema';
import { readSeed } from './seed.utils';

/**
 * Loads the Unidad de Fomento de Vivienda from its creation to today.
 *
 * Half the credit written in this country is denominated in the UFV, so a
 * single reading of it answers nothing: the only question anyone puts to the
 * unit is what it did between two dates. The daily quotation collector could
 * not supply that — the bank's front page states today and no archive — but the
 * chart behind that page is fed by a range endpoint that goes back to
 * 7 December 2001, the day the unit was created at parity with the boliviano.
 *
 * Loaded as `DAILY_AVERAGE` rather than `POINT_IN_TIME`: the bank computes one
 * value per calendar day and publishes it as the value of that day, which is
 * not the same statistic as a price someone happened to observe at an instant.
 * The distinction is the one `economic_indicator_daily` already groups by, so
 * the archive and the front-page reading stay two rows instead of collapsing
 * into a number that is neither.
 *
 * Idempotent on the payload digest, like every loader beside it.
 */

const AGENT_CODE = 'UFV_HISTORY_BACKFILL';
const INDICATOR_NAME = 'Unidad de Fomento de Vivienda';

/** Each year is its own retrieval, so each carries its own digest. */
async function reconcileYearArtifact(
  year: UfvYear,
  sourceId: string,
  transaction: Transaction,
): Promise<string> {
  const existing = await SourceArtifactModel.findOne({
    where: { sha256: year.documentSha256 },
    transaction,
  });
  if (existing) return existing.sourceArtifactId;

  const sourceArtifactId = randomUUID();
  await SourceArtifactModel.create(
    {
      sourceArtifactId,
      sourceId,
      artifactType: 'JSON',
      originalUri: year.sourceUrl,
      storageUri: year.sourceUrl,
      mimeType: 'application/json',
      sha256: year.documentSha256,
      retrievedAt: new Date(year.retrievedAt),
      metadataJson: {
        publisher: 'BANCO CENTRAL DE BOLIVIA',
        indicatorCode: 'UFV_BOB',
        indicatorName: INDICATOR_NAME,
        period: year.period,
        pointCount: year.points.length,
        retrievalStrategy: 'VERSIONED_SNAPSHOT_V1',
      },
    },
    { transaction },
  );
  return sourceArtifactId;
}

/** Payload for one day, shaped like the quotation collector's so both chart alike. */
function dailyPayload(point: UfvPoint, sourceUrl: string): Record<string, unknown> {
  return {
    recordType: 'DAILY_INDICATOR',
    dataCategory: 'UFV',
    eventDate: point.eventDate,
    aggregation: 'DAILY_AVERAGE',
    measures: [
      {
        indicatorCode: 'UFV_BOB',
        indicatorName: INDICATOR_NAME,
        value: point.value,
        // The figure as the bank writes it, so the evidence literally contains
        // what the record claims. The normalised form above is for arithmetic.
        statedValue: point.statedValue,
        unit: 'BOB/UFV',
      },
    ],
    publisher: 'BANCO CENTRAL DE BOLIVIA',
    publisherVerified: true,
    publicationInDocument: true,
    url: sourceUrl,
    storageUri: sourceUrl,
  };
}

async function reconcileYear(
  year: UfvYear,
  sourceId: string,
  agentRunId: string,
  transaction: Transaction,
): Promise<void> {
  const entries = year.points.map((point) => ({
    point,
    payload: dailyPayload(point, year.sourceUrl),
  }));
  const hashes = entries.map((entry) => rawPayloadHash(entry.payload));

  const present = new Set<string>();
  for (let start = 0; start < hashes.length; start += 500) {
    const rows = await RawObservationModel.findAll({
      attributes: ['payloadHash'],
      where: { payloadHash: { [Op.in]: hashes.slice(start, start + 500) } },
      transaction,
    });
    for (const row of rows) present.add(row.payloadHash);
  }
  if (present.size === entries.length) return;

  const sourceArtifactId = await reconcileYearArtifact(year, sourceId, transaction);

  for (const [index, entry] of entries.entries()) {
    const payloadHash = hashes[index];
    if (!payloadHash || present.has(payloadHash)) continue;

    const { point } = entry;
    const observation = await RawObservationModel.create(
      {
        agentRunId,
        sourceArtifactId,
        payloadJson: entry.payload,
        payloadHash,
        receivedAt: new Date(year.retrievedAt),
        processingStatus: 'NORMALIZED',
        retryCount: 0,
      },
      { transaction },
    );

    const assertion = `${INDICATOR_NAME} el ${point.eventDate}: ${point.value} BOB/UFV, según el Banco Central de Bolivia.`;
    const factClaimId = randomUUID();
    await FactClaimModel.create(
      {
        factClaimId,
        agentRunId,
        rawObservationId: observation.rawObservationId,
        claimType: 'INDICATOR_READING',
        assertion,
        eventDate: point.eventDate,
        confidenceLevel: 'HIGH',
        confidenceScore: '0.9500',
        impactLevel: 'MEDIUM',
        timeHorizon: 'SHORT_TERM',
        status: 'PUBLISHED',
        contentHash: claimContentHash({
          claimType: 'INDICATOR_READING',
          assertion,
          eventDate: point.eventDate,
        }),
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
        locator: year.sourceUrl,
        retrievedAt: new Date(year.retrievedAt),
      },
      { transaction },
    );
  }
}

export async function reconcileUfvHistory(
  sourceId: string,
  transaction: Transaction,
): Promise<void> {
  const history = await readSeed('boot/ufv-history.json', ufvHistorySchema);
  const agentRunId = await reconcileHistoryRun(AGENT_CODE, transaction);
  for (const year of history.years) {
    await reconcileYear(year, sourceId, agentRunId, transaction);
  }
}
