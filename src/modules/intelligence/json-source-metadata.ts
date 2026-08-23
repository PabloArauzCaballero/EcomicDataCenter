import type { HtmlSourceMetadata } from './source-metadata';

/**
 * Publication metadata for sources that answer with JSON instead of a document.
 *
 * A market data endpoint states when it captured a quote in a timestamp field
 * rather than in `<meta>` tags, so without this the reading reached
 * `assessPublicationMetadata` with no declared date and was demoted as an
 * unverified publication date even though the source does declare one.
 */

const maximumJsonCharacters = 200_000;
const maximumMatches = 20;

/** Timestamp fields that state when the payload's data was published or captured. */
const publicationDateKeys = new Set([
  'fetched_at',
  'fetchedat',
  'published_at',
  'publishedat',
  'datepublished',
  'date_published',
  'timestamp',
  'observed_at',
  'observedat',
]);

/**
 * Extracts declared publication instants from a JSON body.
 *
 * Only complete ISO-8601 instants are returned. `assessPublicationMetadata`
 * rejects anything else anyway, and a loose local-time string would otherwise
 * collide with the real instant and make the source look self-contradicting.
 */
export function jsonSourceMetadata(text: string): HtmlSourceMetadata {
  const publicationDates = new Set<string>();
  if (text.length <= maximumJsonCharacters) {
    const pattern =
      /"([A-Za-z_]{1,32})"\s*:\s*"(\d{4}-\d{2}-\d{2}T[^"]{1,40}(?:Z|[+-]\d{2}:\d{2}))"/gu;
    for (const match of text.matchAll(pattern)) {
      const key = match[1]?.toLocaleLowerCase('en');
      const value = match[2];
      if (!key || !value || !publicationDateKeys.has(key)) continue;
      publicationDates.add(value);
      if (publicationDates.size >= maximumMatches) break;
    }
  }
  return { publishers: [], publicationDates: [...publicationDates], canonicalUrls: [] };
}
