import { indicatorEventDateIssue } from '../indicator-event-date';

const laPaz = 'America/La_Paz';

describe('indicatorEventDateIssue', () => {
  it('accepts the local date of the run', () => {
    // 2026-08-22T20:00Z is 16:00 in La Paz on the 22nd.
    expect(
      indicatorEventDateIssue('2026-08-22', new Date('2026-08-22T20:00:00Z'), laPaz),
    ).toBeUndefined();
  });

  it('accepts a table already dated for the next day', () => {
    // The BCB switches its quotation table during the evening; at 20:56 local
    // the published table is tomorrow's, and it is the authoritative reading.
    expect(
      indicatorEventDateIssue('2026-08-23', new Date('2026-08-23T00:56:00Z'), laPaz),
    ).toBeUndefined();
  });

  it('rejects yesterday, so a stale reading is never stored as current', () => {
    expect(indicatorEventDateIssue('2026-08-21', new Date('2026-08-22T20:00:00Z'), laPaz)).toBe(
      'OUTSIDE_INDICATOR_DATE_WINDOW',
    );
  });

  it('rejects a date beyond the next day', () => {
    expect(indicatorEventDateIssue('2026-08-24', new Date('2026-08-22T20:00:00Z'), laPaz)).toBe(
      'OUTSIDE_INDICATOR_DATE_WINDOW',
    );
  });

  it('resolves the window in the reporting time zone, not in UTC', () => {
    // 2026-08-23T02:00Z is still 22:00 on the 22nd in La Paz.
    const runAt = new Date('2026-08-23T02:00:00Z');

    expect(indicatorEventDateIssue('2026-08-22', runAt, laPaz)).toBeUndefined();
    expect(indicatorEventDateIssue('2026-08-23', runAt, laPaz)).toBeUndefined();
    expect(indicatorEventDateIssue('2026-08-24', runAt, laPaz)).toBe(
      'OUTSIDE_INDICATOR_DATE_WINDOW',
    );
  });

  it('crosses a month boundary on the calendar', () => {
    expect(
      indicatorEventDateIssue('2026-09-01', new Date('2026-08-31T20:00:00Z'), laPaz),
    ).toBeUndefined();
  });

  it('reports a reading that declares no date', () => {
    expect(indicatorEventDateIssue(null, new Date('2026-08-22T20:00:00Z'), laPaz)).toBe(
      'MISSING_EVENT_DATE',
    );
  });
});
