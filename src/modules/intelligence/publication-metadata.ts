export type PublicationMetadataAssessment =
  'MATCHED' | 'CONTRADICTED' | 'AMBIGUOUS' | 'UNAVAILABLE';

interface ParsedPublicationDate {
  calendarDate: string;
  instant?: number;
}

function validCalendarDate(value: string): string | undefined {
  const date = /^\d{4}-\d{2}-\d{2}/u.exec(value)?.[0];
  if (!date) return undefined;
  const parsed = new Date(`${date}T00:00:00Z`);
  return !Number.isNaN(parsed.valueOf()) && parsed.toISOString().slice(0, 10) === date
    ? date
    : undefined;
}

function parsePublicationDate(value: string): ParsedPublicationDate | undefined {
  const normalized = value.trim();
  const calendarDate = validCalendarDate(normalized);
  if (!calendarDate) return undefined;
  if (/^\d{4}-\d{2}-\d{2}$/u.test(normalized)) return { calendarDate };
  if (!/^\d{4}-\d{2}-\d{2}T.+(?:Z|[+-]\d{2}:\d{2})$/u.test(normalized)) return undefined;
  const instant = Date.parse(normalized);
  return Number.isFinite(instant) ? { calendarDate, instant } : undefined;
}

function publicationDatesMatch(
  expected: ParsedPublicationDate,
  declared: ParsedPublicationDate,
): boolean {
  if (expected.instant !== undefined && declared.instant !== undefined) {
    return expected.instant === declared.instant;
  }
  return expected.calendarDate === declared.calendarDate;
}

/** Compares exact instants when possible and falls back only for date-only source metadata. */
export function assessPublicationMetadata(
  publishedAt: string,
  sourcePublicationDates: readonly string[],
): PublicationMetadataAssessment {
  const expected = parsePublicationDate(publishedAt);
  const declared = sourcePublicationDates
    .map(parsePublicationDate)
    .filter((value): value is ParsedPublicationDate => value !== undefined);
  if (!declared.length) return 'UNAVAILABLE';
  if (!expected) return 'CONTRADICTED';
  const hasConflictingDeclarations = declared.some((left, index) =>
    declared.slice(index + 1).some((right) => !publicationDatesMatch(left, right)),
  );
  const outcomes = new Set(declared.map((value) => publicationDatesMatch(expected, value)));
  if (hasConflictingDeclarations || outcomes.size > 1) return 'AMBIGUOUS';
  return outcomes.has(true) ? 'MATCHED' : 'CONTRADICTED';
}
