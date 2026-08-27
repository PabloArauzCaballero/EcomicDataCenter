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
import {
  compositeIndexHistorySchema,
  type CompositeIndexSeries,
} from '../schemas/composite-index-history.schema';
import { readSeed } from './seed.utils';

/**
 * Loads the indices that rate Bolivia rather than measure it.
 *
 * Human development, perceived corruption, the strength of the rule of law: the
 * observatory could describe how much the country produced and what it owed,
 * and nothing about how it is governed or how its people live beyond a handful
 * of headcounts. These close that.
 *
 * Every claim names the institution that built the index, because that is the
 * only way the figure is readable: «28 en el Indice de Percepcion de la
 * Corrupcion de Transparency International» is a statement someone can check
 * and argue with, while «28 de corrupcion» is not a statement at all. The
 * distributor is kept in the artifact metadata rather than in the assertion —
 * it is where the bytes came from, not whose judgement the number is.
 *
 * Idempotent on the payload digest, like every loader beside it.
 */

const AGENT_CODE = 'COMPOSITE_INDEX_BACKFILL';

async function reconcileSeriesArtifact(
  series: CompositeIndexSeries,
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
      artifactType: 'CSV',
      originalUri: series.provenance.sourceUrl,
      storageUri: series.provenance.sourceUrl,
      mimeType: 'text/csv',
      sha256: series.provenance.upstreamSha256,
      retrievedAt: new Date(series.provenance.retrievedAt),
      metadataJson: {
        publisher: series.provenance.publisher,
        distributor: series.provenance.distributor,
        indicatorCode: series.indicatorCode,
        indicatorName: series.name,
        valueColumn: series.provenance.valueColumn,
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
 * Whether the value really sits in the column the provenance names.
 *
 * The grounding check the prose paths use reads numbers out of running text,
 * where a comma is a decimal mark. A CSV row is not running text: its commas
 * separate fields, so `1990,0.552` reads there as one number and the check
 * rejects a figure that is plainly present. The right test for this shape is
 * stricter anyway — not «does the number appear somewhere» but «is it the field
 * under the heading this series claims to read» — which is why the excerpt
 * carries the heading row with the data row.
 */
function quotesItsOwnColumn(
  series: CompositeIndexSeries,
  point: CompositeIndexSeries['points'][number],
): boolean {
  const [heading, row] = point.excerpt.split('\n');
  if (heading === undefined || row === undefined) return false;
  const column = heading.split(',').indexOf(series.provenance.valueColumn);
  if (column < 0) return false;
  return row.split(',')[column]?.trim() === point.value;
}

/** Payload for one year, shaped like the annual macro series so both chart alike. */
function annualPayload(
  series: CompositeIndexSeries,
  point: CompositeIndexSeries['points'][number],
): Record<string, unknown> {
  return {
    recordType: 'PERIOD_INDICATOR',
    dataCategory: 'COMPOSITE_INDEX',
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
    publisher: series.provenance.publisher,
    distributor: series.provenance.distributor,
    publisherVerified: true,
    url: series.provenance.sourceUrl,
    sha256: series.provenance.upstreamSha256,
    storageUri: series.provenance.sourceUrl,
  };
}

async function reconcileSeries(
  series: CompositeIndexSeries,
  sourceId: string,
  agentRunId: string,
  transaction: Transaction,
): Promise<void> {
  const entries = series.points.map((point) => ({ point, payload: annualPayload(series, point) }));
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

  const sourceArtifactId = await reconcileSeriesArtifact(series, sourceId, transaction);

  for (const [index, entry] of entries.entries()) {
    const payloadHash = hashes[index];
    if (!payloadHash || present.has(payloadHash)) continue;

    const { excerpt } = entry.point;
    if (!quotesItsOwnColumn(series, entry.point)) {
      throw new Error(
        `${series.indicatorCode} ${entry.point.period}: el valor no está en la columna «${series.provenance.valueColumn}» de la fila citada`,
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

    const assertion = `${series.name} de Bolivia en ${entry.point.period}: ${entry.point.value}, según ${series.provenance.publisher}.`;
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
        impactLevel: 'MEDIUM',
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

export async function reconcileCompositeIndices(
  sourceId: string,
  transaction: Transaction,
): Promise<void> {
  const history = await readSeed('boot/composite-indices.json', compositeIndexHistorySchema);
  const agentRunId = await reconcileHistoryRun(AGENT_CODE, transaction);
  for (const series of history.series) {
    await reconcileSeries(series, sourceId, agentRunId, transaction);
  }
}
