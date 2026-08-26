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
import { ungroundedMeasures } from '../../../common/economic-indicators/indicator-codes';
import {
  macroAnnualHistorySchema,
  type MacroAnnualSeries,
} from '../schemas/macro-annual-history.schema';
import { readSeed } from './seed.utils';

/**
 * Loads the annual macroeconomic series that give the daily rates their context.
 *
 * An exchange rate on its own says what a dollar costs, not why. Inflation,
 * output, reserves and the external balance are what a reader needs to judge
 * whether a widening gap is a market moving or an economy under strain, and
 * they come from a compiler that publishes them once a year with a stable,
 * citable address per indicator.
 *
 * These are a different frequency from everything else in the observatory and
 * are marked as such, so nothing can chart an annual figure on a daily axis or
 * average the two together.
 */

const AGENT_CODE = 'WORLD_BANK_MACRO_BACKFILL';

/**
 * Snapshots making up the series, each its own retrieval.
 *
 * The range is split rather than re-fetched as one: the digest of a retrieval
 * travels inside every payload it produced, so widening a range already loaded
 * would rewrite hashes and duplicate rows that are already correct.
 */
const SNAPSHOTS = [
  'boot/macro-annual-history-1960.json',
  'boot/macro-annual-history.json',
  'boot/macro-annual-sectors.json',
  'boot/macro-annual-debt.json',
  'boot/macro-annual-fx.json',
] as const;

/** Each indicator is its own retrieval, so each carries its own digest. */
async function reconcileSeriesArtifact(
  series: MacroAnnualSeries,
  sourceId: string,
  transaction: Transaction,
): Promise<string> {
  const existing = await SourceArtifactModel.findOne({
    where: { sha256: series.provenance.upstreamSha256 },
    transaction,
  });
  if (existing) return existing.sourceArtifactId;

  const sourceArtifactId = randomUUID();
  await SourceArtifactModel.create(
    {
      sourceArtifactId,
      sourceId,
      artifactType: 'JSON',
      originalUri: series.provenance.sourceUrl,
      storageUri: series.provenance.sourceUrl,
      mimeType: 'application/json',
      sha256: series.provenance.upstreamSha256,
      retrievedAt: new Date(series.provenance.retrievedAt),
      metadataJson: {
        publisher: series.provenance.publisher,
        indicatorCode: series.indicatorCode,
        compilerCode: series.worldBankCode,
        indicatorName: series.name,
        frequency: series.provenance.frequency,
        pointCount: series.points.length,
        retrievalStrategy: 'VERSIONED_SNAPSHOT_V1',
      },
    },
    { transaction },
  );
  return sourceArtifactId;
}

/**
 * Payload for one year.
 *
 * `eventDate` closes the period rather than opening it, because a figure that
 * describes a year is only known once the year is over, and a reader sorting by
 * date should not see it appear before the days it summarises.
 */
function annualPayload(
  series: MacroAnnualSeries,
  point: MacroAnnualSeries['points'][number],
): Record<string, unknown> {
  return {
    recordType: 'PERIOD_INDICATOR',
    dataCategory: 'MACRO_ANNUAL',
    eventDate: `${point.period}-12-31`,
    period: point.period,
    frequency: series.provenance.frequency,
    measures: [
      {
        indicatorCode: series.indicatorCode,
        priceSide: null,
        value: point.value,
        unit: series.unit,
      },
    ],
    indicatorName: series.name,
    compilerCode: series.worldBankCode,
    publisher: series.provenance.publisher,
    publisherVerified: true,
    url: series.provenance.sourceUrl,
    sha256: series.provenance.upstreamSha256,
    storageUri: series.provenance.sourceUrl,
  };
}

async function reconcileSeries(
  series: MacroAnnualSeries,
  sourceId: string,
  agentRunId: string,
  transaction: Transaction,
): Promise<void> {
  const sourceArtifactId = await reconcileSeriesArtifact(series, sourceId, transaction);

  const entries = series.points.map((point) => ({ point, payload: annualPayload(series, point) }));
  const hashes = entries.map((entry) => rawPayloadHash(entry.payload));
  const present = new Set(
    (
      await RawObservationModel.findAll({
        attributes: ['payloadHash'],
        where: { payloadHash: { [Op.in]: hashes } },
        transaction,
      })
    ).map((row) => row.payloadHash),
  );

  for (const [index, entry] of entries.entries()) {
    const payloadHash = hashes[index];
    if (!payloadHash || present.has(payloadHash)) continue;

    const { excerpt } = entry.point;
    const measures = (entry.payload as { measures: Parameters<typeof ungroundedMeasures>[0] })
      .measures;
    // The same rule the ingestion path enforces: a figure absent from the
    // quotation kept as evidence is not a reading.
    const ungrounded = ungroundedMeasures(measures, excerpt);
    if (ungrounded.length) {
      throw new Error(
        `${series.indicatorCode} ${entry.point.period}: figures absent from the cited excerpt: ${ungrounded.join(', ')}`,
      );
    }

    const observation = await RawObservationModel.create(
      {
        agentRunId,
        sourceArtifactId,
        payloadJson: entry.payload,
        payloadHash,
        receivedAt: new Date(series.provenance.retrievedAt),
        processingStatus: 'NORMALIZED',
        retryCount: 0,
      },
      { transaction },
    );

    const assertion = `${series.name} de Bolivia en ${entry.point.period}: ${entry.point.value} (${series.unit}).`;
    const factClaimId = randomUUID();
    await FactClaimModel.create(
      {
        factClaimId,
        agentRunId,
        rawObservationId: observation.rawObservationId,
        claimType: 'INDICATOR_READING',
        assertion,
        eventDate: `${entry.point.period}-12-31`,
        confidenceLevel: 'HIGH',
        confidenceScore: '0.9000',
        impactLevel: 'HIGH',
        timeHorizon: 'STRUCTURAL',
        status: 'PUBLISHED',
        contentHash: claimContentHash({
          claimType: 'INDICATOR_READING',
          assertion,
          eventDate: `${entry.point.period}-12-31`,
        }),
        createdAt: new Date(),
      },
      { transaction },
    );

    await ClaimEvidenceModel.create(
      {
        factClaimId,
        sourceArtifactId,
        excerpt,
        excerptHash: createHash('sha256').update(excerpt).digest('hex'),
        locator: series.provenance.sourceUrl,
        retrievedAt: new Date(series.provenance.retrievedAt),
      },
      { transaction },
    );
  }
}

export async function reconcileMacroAnnualHistory(
  sourceId: string,
  transaction: Transaction,
): Promise<void> {
  const agentRunId = await reconcileHistoryRun(AGENT_CODE, transaction);
  for (const snapshot of SNAPSHOTS) {
    const history = await readSeed(snapshot, macroAnnualHistorySchema);
    for (const series of history.series) {
      await reconcileSeries(series, sourceId, agentRunId, transaction);
    }
  }
}
