/** How often a source is supposed to say something new. */
export type SourceCadence = 'CONTINUOUS' | 'PERIODIC' | 'HISTORICAL';

/**
 * Whether a source is behind the calendar it declared.
 *
 * `unknown` is a first-class answer and the default. A source with no declared
 * calendar cannot be late, because nothing said when it was due; reporting it
 * as on time would be an invention and reporting it as late would be a false
 * alarm that teaches an operator to ignore the column.
 */
export type FreshnessState = 'on_time' | 'late' | 'not_applicable' | 'unknown';

export interface SourceExpectation {
  readonly cadence: SourceCadence;
  readonly expectedIntervalHours: number | null;
  readonly toleranceHours: number;
  readonly isActive: boolean;
}

export interface SourceObservation {
  /** When the collector last reached the source at all. */
  readonly lastAttemptAt: Date | null;
  /** When the collector last reached it and the call succeeded. */
  readonly lastSuccessAt: Date | null;
  /** The most recent instant the data itself refers to. */
  readonly lastObservedAt: Date | null;
  /** When something the source produced was last written down. */
  readonly lastPersistedAt: Date | null;
  /** When something the source produced last became visible to a reader. */
  readonly lastPublishedAt: Date | null;
}

export interface FreshnessVerdict {
  readonly state: FreshnessState;
  /** Hours past the moment the next delivery was due; null when not due. */
  readonly overdueHours: number | null;
  readonly reason: string;
}

const MILLISECONDS_PER_HOUR = 3_600_000;

/**
 * Judges a source against its own declared calendar, and nothing else.
 *
 * Two mistakes this is written to avoid. The first is deriving lateness from
 * the age of the newest datum: an annual series published every March is not
 * eleven months late in February, and a daily source that answered today with
 * the same figure as yesterday is not stale — it had nothing new to say, which
 * is a result, not a failure. The second is treating an HTTP 200 as delivery:
 * the call succeeding is what `lastSuccessAt` records, and a source can be
 * reachable and still be missing the figure it promised.
 *
 * So the verdict is computed from the last *successful consultation* against
 * the interval the source declared, widened by its tolerance. A source that
 * has never been consulted successfully is late from the moment its first
 * interval elapses, and unknown before any attempt at all.
 */
export function judgeFreshness(
  expectation: SourceExpectation | null,
  observation: SourceObservation,
  now: Date,
): FreshnessVerdict {
  if (!expectation) {
    return { state: 'unknown', overdueHours: null, reason: 'Sin calendario declarado' };
  }
  if (!expectation.isActive) {
    return { state: 'not_applicable', overdueHours: null, reason: 'Fuente desactivada' };
  }
  if (expectation.cadence === 'HISTORICAL' || expectation.expectedIntervalHours === null) {
    return {
      state: 'not_applicable',
      overdueHours: null,
      reason: 'Fuente histórica: no se espera entrega nueva',
    };
  }
  const reference = observation.lastSuccessAt ?? observation.lastAttemptAt;
  if (!reference) {
    return {
      state: 'unknown',
      overdueHours: null,
      reason: 'Nunca se consultó: no hay evidencia para juzgar el calendario',
    };
  }
  const allowanceHours = expectation.expectedIntervalHours + expectation.toleranceHours;
  const elapsedHours = (now.getTime() - reference.getTime()) / MILLISECONDS_PER_HOUR;
  if (elapsedHours <= allowanceHours) {
    return {
      state: 'on_time',
      overdueHours: null,
      reason: observation.lastSuccessAt
        ? 'Última consulta exitosa dentro del calendario'
        : 'Última consulta dentro del calendario, sin éxito confirmado',
    };
  }
  return {
    state: 'late',
    overdueHours: Math.round((elapsedHours - allowanceHours) * 100) / 100,
    reason: `Sin consulta exitosa en ${Math.round(elapsedHours)} h; el calendario admite ${allowanceHours} h`,
  };
}

/**
 * Whether what a source delivered has reached the reader.
 *
 * Persistence and publication are separate instants on purpose. A load that
 * committed and a snapshot that never refreshed is the exact state a green
 * pipeline was reporting as success, and the only way to see it is to compare
 * the two.
 */
export function publicationLagHours(observation: SourceObservation): number | null {
  const { lastPersistedAt, lastPublishedAt } = observation;
  if (!lastPersistedAt) return null;
  if (!lastPublishedAt) return null;
  const lag = (lastPersistedAt.getTime() - lastPublishedAt.getTime()) / MILLISECONDS_PER_HOUR;
  return lag <= 0 ? 0 : Math.round(lag * 100) / 100;
}
