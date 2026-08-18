import {
  assessPublicationMetadata,
  calibrateConfidenceForPublicationDate,
} from '../publication-metadata';

describe('assessPublicationMetadata', () => {
  it('matches the same instant across calendar-day and timezone boundaries', () => {
    expect(assessPublicationMetadata('2026-08-18T00:30:00Z', ['2026-08-17T20:30:00-04:00'])).toBe(
      'MATCHED',
    );
  });

  it('contradicts different instants even when their calendar date is equal', () => {
    expect(assessPublicationMetadata('2026-08-18T12:30:00Z', ['2026-08-18T08:31:00-04:00'])).toBe(
      'CONTRADICTED',
    );
  });

  it('falls back to calendar comparison for source metadata containing only a date', () => {
    expect(assessPublicationMetadata('2026-08-18T23:30:00-04:00', ['2026-08-18'])).toBe('MATCHED');
  });

  it('reports unavailable metadata without claiming a match', () => {
    expect(assessPublicationMetadata('2026-08-18T12:30:00Z', [])).toBe('UNAVAILABLE');
    expect(assessPublicationMetadata('2026-08-18T12:30:00Z', ['not-a-date'])).toBe('UNAVAILABLE');
    expect(assessPublicationMetadata('2026-08-18T12:30:00Z', ['2026-08-18T08:30:00'])).toBe(
      'UNAVAILABLE',
    );
  });

  it('reports ambiguity when valid declarations disagree with each other', () => {
    expect(
      assessPublicationMetadata('2026-08-18T12:30:00Z', [
        '2026-08-18T08:30:00-04:00',
        '2026-08-18T09:00:00-04:00',
      ]),
    ).toBe('AMBIGUOUS');
    expect(
      assessPublicationMetadata('2026-08-18T12:30:00Z', [
        '2026-08-17T08:30:00-04:00',
        '2026-08-16T09:00:00-04:00',
      ]),
    ).toBe('AMBIGUOUS');
  });
});

describe('calibrateConfidenceForPublicationDate', () => {
  it('preserves confidence when source metadata verifies the timestamp', () => {
    expect(calibrateConfidenceForPublicationDate('HIGH', 0.91, true)).toEqual({
      confidenceLevel: 'HIGH',
      confidenceScore: 0.91,
      adjusted: false,
    });
  });

  it('routes an AI-only timestamp to the low-confidence review path', () => {
    expect(calibrateConfidenceForPublicationDate('VERY_HIGH', 0.97, false)).toEqual({
      confidenceLevel: 'LOW',
      confidenceScore: 0.49,
      adjusted: true,
    });
    expect(calibrateConfidenceForPublicationDate('LOW', null, false)).toEqual({
      confidenceLevel: 'LOW',
      confidenceScore: null,
      adjusted: false,
    });
  });
});
