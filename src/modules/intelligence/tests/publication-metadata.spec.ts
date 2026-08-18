import { assessPublicationMetadata } from '../publication-metadata';

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
