/**
 * Date window a daily indicator reading may cover.
 *
 * An official quotation table switches to the following day's value during the
 * evening, so a run late in the local day legitimately reads a table dated
 * tomorrow. Demanding the run's own date discarded the most authoritative
 * reading available and then reported the category as missing, failing the run
 * over data that had in fact been published.
 *
 * The window is exactly two days wide. Anything earlier is stale, and anything
 * further ahead is not a quotation any source publishes.
 */

export type IndicatorEventDateIssue = 'MISSING_EVENT_DATE' | 'OUTSIDE_INDICATOR_DATE_WINDOW';

function localDateKey(instant: Date, timeZone: string): string {
  return new Intl.DateTimeFormat('en-CA', {
    timeZone,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).format(instant);
}

/** Calendar day after a `YYYY-MM-DD` date, computed on the calendar itself. */
function nextCalendarDate(date: string): string {
  const next = new Date(`${date}T00:00:00Z`);
  next.setUTCDate(next.getUTCDate() + 1);
  return next.toISOString().slice(0, 10);
}

export function indicatorEventDateIssue(
  eventDate: string | null,
  runAt: Date,
  timeZone: string,
): IndicatorEventDateIssue | undefined {
  if (!eventDate) return 'MISSING_EVENT_DATE';
  const today = localDateKey(runAt, timeZone);
  return eventDate === today || eventDate === nextCalendarDate(today)
    ? undefined
    : 'OUTSIDE_INDICATOR_DATE_WINDOW';
}
