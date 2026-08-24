/**
 * Material events published by the Bolivian stock exchange.
 *
 * These are the country's registry of corporate facts that move a price: new
 * issues, rating decisions, board resolutions, registrations. Each one is dated
 * to the second, attributed to the entity that filed it, and lives at a stable
 * address, which makes it the only source of company news in this observatory
 * that needs no interpretation at all — it is read, not researched.
 */

export interface MaterialEvent {
  /** Entity that filed the event, as the exchange names it. */
  filer: string;
  /** Subject line the exchange gives the filing. */
  subject: string;
  /** Instant the exchange stamps on it, exactly as published. */
  statedInstant: string;
  /** Same instant as ISO-8601, in the country's offset. */
  publishedAt: string;
  /** Calendar date in the country's time zone. */
  eventDate: string;
  /** Stable address of the filing. */
  url: string;
}

/**
 * Bolivia keeps a single offset the whole year, so a stamp on an exchange
 * filing can be carried to an instant without a time zone database.
 */
const BOLIVIA_OFFSET = '-04:00';

const ITEM =
  /bbvpress-item__content(?<body>[\s\S]{0,4000}?)bbvpress-item__data(?<data>[\s\S]{0,900}?)<\/div>/gu;
const FILER = /bbvpress-item__title"[^>]*>([\s\S]*?)<\/h/u;
const SUBJECT = /bbvpress-item__subtitle"[^>]*>([\s\S]*?)<\/h/u;
const STAMP = /bbvpress-item__date"[^>]*>\s*(\d{2}\/\d{2}\/\d{4} \d{2}:\d{2}:\d{2})\s*<\/p/u;
const LINK = /bbvpress-item__link"[^>]*href="([^"]+)"/u;

/** Collapses markup and entities into the text a reader would see. */
function plainText(value: string): string {
  return value
    .replace(/<[^>]*>/gu, ' ')
    .replace(/&nbsp;/gu, ' ')
    .replace(/&amp;/gu, '&')
    .replace(/&#8211;/gu, '–')
    .replace(/\s+/gu, ' ')
    .trim();
}

/** `dd/mm/yyyy HH:MM:SS` as the exchange writes it, carried to an instant. */
function toInstant(stamp: string): { publishedAt: string; eventDate: string } | undefined {
  const match = /^(\d{2})\/(\d{2})\/(\d{4}) (\d{2}:\d{2}:\d{2})$/u.exec(stamp);
  if (!match) return undefined;
  const [, day, month, year, time] = match;
  const eventDate = `${year}-${month}-${day}`;
  const publishedAt = `${eventDate}T${time}${BOLIVIA_OFFSET}`;
  return Number.isNaN(Date.parse(publishedAt)) ? undefined : { publishedAt, eventDate };
}

/**
 * Reads the filings a listing page carries.
 *
 * An item missing any of its four parts is skipped rather than filled in: a
 * filing without a filer, a subject, a stamp or an address is not a record of
 * anything.
 */
export function parseMaterialEvents(html: string): MaterialEvent[] {
  const events: MaterialEvent[] = [];
  for (const match of html.matchAll(ITEM)) {
    const body = match.groups?.body ?? '';
    const data = match.groups?.data ?? '';
    const filer = plainText(FILER.exec(body)?.[1] ?? '');
    const subject = plainText(SUBJECT.exec(body)?.[1] ?? '');
    const statedInstant = STAMP.exec(data)?.[1];
    const url = LINK.exec(data)?.[1];
    if (!filer || !subject || !statedInstant || !url) continue;
    const instant = toInstant(statedInstant);
    if (!instant) continue;
    events.push({ filer, subject, statedInstant, url, ...instant });
  }
  return events;
}

/**
 * True when the filing's own page repeats the stamp the listing showed.
 *
 * This is what lets a filing be treated as dated: the document states its own
 * instant, which is a stronger claim than a `<meta>` tag a publisher may have
 * generated for the page rather than for the event. A page that does not repeat
 * its stamp is not rejected — it simply is not date-verified.
 */
export function documentStatesInstant(documentText: string, statedInstant: string): boolean {
  return documentText.includes(statedInstant);
}

/**
 * Wording for a filing.
 *
 * Carries no figure of its own. Everything quantitative in a material event
 * lives in its text, and restating a number here would put it outside the
 * excerpt that has to support it.
 */
export function materialEventAssertion(event: MaterialEvent): string {
  return `${event.filer} comunicó a la Bolsa Boliviana de Valores un hecho relevante: ${event.subject}.`;
}
