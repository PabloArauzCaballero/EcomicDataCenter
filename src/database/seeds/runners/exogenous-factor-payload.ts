import { rawPayloadHash } from '../../../common/intelligence/claim-normalizer';
import type {
  ExogenousFactorPoint,
  ExogenousFactorSeries,
} from '../schemas/exogenous-factors.schema';

/** firstSeenAt belongs to this revision, not to the period's earliest value. */
export function factorPayload(
  series: ExogenousFactorSeries,
  point: ExogenousFactorPoint,
): Record<string, unknown> {
  const metadata: Record<string, unknown> = { ...series };
  const revision: Record<string, unknown> = { ...point };
  delete metadata.points;
  delete revision.retrievedAt;
  return {
    recordType: 'EXOGENOUS_FACTOR',
    dataCategory: 'EXOGENOUS_FACTOR',
    schemaVersion: 1,
    ...metadata,
    familyIds: [...series.familyIds].sort(),
    sectorIds: [...series.sectorIds].sort(),
    seriesSourceUrl: series.sourceUrl,
    ...revision,
  };
}

/** Same revision redownloaded is idempotent; A → B → A at a new knowledge date is not A1. */
export function factorRevisionHash(
  series: ExogenousFactorSeries,
  point: ExogenousFactorPoint,
): string {
  return rawPayloadHash(factorPayload(series, point));
}

export function factorAssertion(
  series: ExogenousFactorSeries,
  point: ExogenousFactorPoint,
): string {
  const reading = point.value === null ? point.status : `${point.value} ${series.unit}`;
  return `${series.code}: ${series.name} (${series.geography}, ${series.market}), ${point.period}: ${reading}. ${series.observationStatus}; ${series.measurementStatus}.`;
}
