import {
  judgeFreshness,
  publicationLagHours,
  type SourceExpectation,
  type SourceObservation,
} from '../source-schedule.policy';

const NOW = new Date('2026-09-16T12:00:00.000Z');

function observation(overrides: Partial<SourceObservation> = {}): SourceObservation {
  return {
    lastAttemptAt: null,
    lastSuccessAt: null,
    lastObservedAt: null,
    lastPersistedAt: null,
    lastPublishedAt: null,
    ...overrides,
  };
}

const daily: SourceExpectation = {
  cadence: 'CONTINUOUS',
  expectedIntervalHours: 24,
  toleranceHours: 6,
  isActive: true,
};

const annual: SourceExpectation = {
  cadence: 'PERIODIC',
  expectedIntervalHours: 24 * 365,
  toleranceHours: 24 * 30,
  isActive: true,
};

const historical: SourceExpectation = {
  cadence: 'HISTORICAL',
  expectedIntervalHours: null,
  toleranceHours: 0,
  isActive: true,
};

describe('judgeFreshness', () => {
  it('reports unknown, not on time, when no calendar was declared', () => {
    const verdict = judgeFreshness(
      null,
      observation({ lastSuccessAt: new Date('2026-09-16T11:00:00.000Z') }),
      NOW,
    );
    expect(verdict.state).toBe('unknown');
    expect(verdict.overdueHours).toBeNull();
  });

  it('reports unknown when the source has never been consulted', () => {
    expect(judgeFreshness(daily, observation(), NOW).state).toBe('unknown');
  });

  it('accepts a daily source consulted within its interval and tolerance', () => {
    const verdict = judgeFreshness(
      daily,
      observation({ lastSuccessAt: new Date('2026-09-15T14:00:00.000Z') }),
      NOW,
    );
    expect(verdict.state).toBe('on_time');
  });

  it('reports a daily source late once the tolerance is exhausted', () => {
    const verdict = judgeFreshness(
      daily,
      observation({ lastSuccessAt: new Date('2026-09-14T00:00:00.000Z') }),
      NOW,
    );
    expect(verdict.state).toBe('late');
    expect(verdict.overdueHours).toBeCloseTo(30, 2);
  });

  /**
   * The failure this rule exists for: an annual series published every March is
   * not eleven months late in February.
   */
  it('does not call an annual source late for having no figure this month', () => {
    const verdict = judgeFreshness(
      annual,
      observation({ lastSuccessAt: new Date('2026-06-01T00:00:00.000Z') }),
      NOW,
    );
    expect(verdict.state).toBe('on_time');
  });

  it('never calls a historical corpus late', () => {
    const verdict = judgeFreshness(
      historical,
      observation({ lastSuccessAt: new Date('2021-01-01T00:00:00.000Z') }),
      NOW,
    );
    expect(verdict.state).toBe('not_applicable');
  });

  it('marks a deactivated expectation as not applicable', () => {
    const verdict = judgeFreshness({ ...daily, isActive: false }, observation(), NOW);
    expect(verdict.state).toBe('not_applicable');
  });

  /**
   * An attempt that never succeeded still starts the clock, and the reason says
   * the success was never confirmed rather than claiming one.
   */
  it('falls back to the last attempt and says the success is unconfirmed', () => {
    const verdict = judgeFreshness(
      daily,
      observation({ lastAttemptAt: new Date('2026-09-16T06:00:00.000Z') }),
      NOW,
    );
    expect(verdict.state).toBe('on_time');
    expect(verdict.reason).toContain('sin éxito confirmado');
  });
});

describe('publicationLagHours', () => {
  it('is null when nothing was persisted or nothing was published', () => {
    expect(publicationLagHours(observation())).toBeNull();
    expect(publicationLagHours(observation({ lastPersistedAt: NOW }))).toBeNull();
  });

  it('measures how far publication trails persistence', () => {
    const lag = publicationLagHours(
      observation({
        lastPersistedAt: new Date('2026-09-16T12:00:00.000Z'),
        lastPublishedAt: new Date('2026-09-16T06:00:00.000Z'),
      }),
    );
    expect(lag).toBe(6);
  });

  it('reports zero, not a negative lag, when publication is ahead', () => {
    const lag = publicationLagHours(
      observation({
        lastPersistedAt: new Date('2026-09-16T06:00:00.000Z'),
        lastPublishedAt: new Date('2026-09-16T12:00:00.000Z'),
      }),
    );
    expect(lag).toBe(0);
  });
});
