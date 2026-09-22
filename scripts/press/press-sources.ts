/**
 * The outlets the observatory reads, and how their copy is made readable.
 *
 * Five outlets syndicate a feed and are read over plain HTTP. Two do not —
 * Unitel publishes none and Red Uno's stopped being written in 2022 — so their
 * sections are rendered once and the publication date is read from each
 * article's own structured block, never from the URL slug: a slug with digits
 * in it is not a stamp its publisher stands behind.
 *
 * Kept beside the collector rather than inside it so the list of sources can be
 * read, argued with and extended without touching the retrieval.
 *
 * See ADR-0019.
 */
export interface Outlet {
  readonly outlet: string;
  readonly domain: string;
  readonly prefix: string;
  readonly match: RegExp;
  readonly sections: ReadonlyArray<readonly [string, string]>;
}

/** A card found on a rendered section, before its article states a date. */
export type Discovered = Omit<Collected, 'stamp'>;

export interface Collected {
  outlet: string;
  domain: string;
  section: string;
  headline: string;
  summary: string;
  url: string;
  statedDate: string;
  stamp: Date;
  retrievalMethod: 'SYNDICATED_FEED' | 'RENDERED_SECTION';
  listingUrl: string;
  listingSha256: string;
  excerpt: string;
}

export const UA = 'Mozilla/5.0 (compatible; ObservatorioEconomicoBO/1.0)';
export const BROWSER_UA =
  'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0 Safari/537.36';
/** A feed still served but not written to for this long is not coverage. */
export const STALE_DAYS = 45;

export const FEEDS: ReadonlyArray<readonly [string, string, string, string]> = [
  ['EL DEBER', 'eldeber.com.bo', 'Economía', 'https://eldeber.com.bo/rss/economia.xml'],
  ['EL DEBER', 'eldeber.com.bo', 'Dinero', 'https://eldeber.com.bo/rss/dinero.xml'],
  ['EL DEBER', 'eldeber.com.bo', 'País', 'https://eldeber.com.bo/rss/pais.xml'],
  ['LA RAZÓN', 'larazon.bo', 'Portada', 'https://larazon.bo/feed/'],
  ['OPINIÓN', 'opinion.com.bo', 'Portada', 'https://www.opinion.com.bo/rss/'],
  ['BRÚJULA DIGITAL', 'brujuladigital.net', 'Portada', 'https://brujuladigital.net/rss.xml'],
  ['BOLIVIA VERIFICA', 'boliviaverifica.bo', 'Portada', 'https://boliviaverifica.bo/feed/'],
];

export const RENDERED: readonly Outlet[] = [
  {
    outlet: 'UNITEL',
    domain: 'unitel.bo',
    prefix: 'https://unitel.bo',
    match: /\/noticias\/[a-z]+\//,
    sections: [
      ['Economía', 'https://unitel.bo/noticias/economia'],
      ['Política', 'https://unitel.bo/noticias/politica'],
    ],
  },
  {
    outlet: 'RED UNO',
    domain: 'reduno.com.bo',
    prefix: 'https://www.reduno.com.bo',
    match: /^\/(economia|nacional|politica)\//,
    sections: [
      ['Economía', 'https://www.reduno.com.bo/seccion/economia'],
      ['Nacional', 'https://www.reduno.com.bo/seccion/nacional'],
    ],
  },
];

const MONTHS: Record<string, number> = {
  jan: 1,
  feb: 2,
  mar: 3,
  apr: 4,
  may: 5,
  jun: 6,
  jul: 7,
  aug: 8,
  sep: 9,
  oct: 10,
  nov: 11,
  dec: 12,
};
const ENTITIES: Record<string, string> = {
  amp: '&',
  lt: '<',
  gt: '>',
  quot: '"',
  apos: "'",
  nbsp: ' ',
  oacute: 'ó',
  aacute: 'á',
  eacute: 'é',
  iacute: 'í',
  uacute: 'ú',
  ntilde: 'ñ',
  Oacute: 'Ó',
  Aacute: 'Á',
  Eacute: 'É',
  Iacute: 'Í',
  Uacute: 'Ú',
  Ntilde: 'Ñ',
  hellip: '…',
  mdash: '—',
  ndash: '–',
  laquo: '«',
  raquo: '»',
  rsquo: '’',
  lsquo: '‘',
  ldquo: '“',
  rdquo: '”',
};

export const decode = (text: string | undefined): string =>
  (text ?? '')
    .replace(/&#(\d+);/gu, (_: string, code: string) => String.fromCodePoint(Number(code)))
    .replace(/&#x([0-9a-f]+);/giu, (_: string, code: string) =>
      String.fromCodePoint(parseInt(code, 16)),
    )
    .replace(/&([a-z]+);/giu, (whole: string, name: string) => ENTITIES[name] ?? whole);

/**
 * A standfirst as a reader should see it: entities decoded twice because they
 * survive one encoder too many, and without the footer the blogging platform
 * three of these outlets run appends to every item.
 */
export const clean = (text: string | undefined): string =>
  decode(decode(text ?? ''))
    .replace(/\s*The post\b[\s\S]*?appeared first on[\s\S]*$/iu, '')
    .replace(/<[^>]+>/gu, ' ')
    .replace(/\s+/gu, ' ')
    .trim();

export const field = (item: string, ...names: string[]): string => {
  for (const name of names) {
    const match = item.match(new RegExp(`<${name}[^>]*>([\\s\\S]*?)</${name}>`, 'u'));
    const inner = match?.[1];
    if (inner === undefined) continue;
    const value = clean(inner.replace(/^\s*<!\[CDATA\[|\]\]>\s*$/gu, ''));
    if (value) return value;
  }
  return '';
};

/** The instant a feed states, in whichever of the two shapes it states it. */
export function parseStamp(raw: string): Date | null {
  const rfc = raw
    .trim()
    .match(
      /^[A-Za-z]{3},\s*(\d{1,2})\s+([A-Za-z]{3})\w*\s+(\d{2}|\d{4})\s+(\d{2}):(\d{2}):(\d{2})\s*(GMT|UTC|Z|[+-]\d{4})?$/u,
    );
  if (rfc) {
    const [, day, month, year, hour, minute, second, zone] = rfc;
    const monthNumber = month === undefined ? undefined : MONTHS[month.toLowerCase()];
    if (!monthNumber || !day || !year || !hour || !minute || !second) return null;
    // RFC 822 allowed a two-digit year and one outlet still writes one.
    const full = year.length === 2 ? `20${year}` : year;
    const offset = zone && /^[+-]\d{4}$/u.test(zone) ? `${zone.slice(0, 3)}:${zone.slice(3)}` : 'Z';
    const stamp = new Date(
      `${full}-${String(monthNumber).padStart(2, '0')}-${day.padStart(2, '0')}` +
        `T${hour}:${minute}:${second}${offset}`,
    );
    return Number.isNaN(stamp.getTime()) ? null : stamp;
  }

  const parsed = new Date(
    /[Zz]|[+-]\d{2}:?\d{2}$/u.test(raw.trim()) ? raw.trim() : `${raw.trim()}-04:00`,
  );
  return Number.isNaN(parsed.getTime()) ? null : parsed;
}

/** Bolivia keeps one offset all year, so a story's day is its day in Bolivia. */
export const inBolivia = (date: Date): Date => new Date(date.getTime() - 4 * 3_600_000);
