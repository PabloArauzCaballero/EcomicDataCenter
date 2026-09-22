/**
 * The outlets that publish their own back catalogue, and where it lives.
 *
 * The public web archive stopped answering us — it is somebody's free service
 * and it drops a client that has asked enough — so the record of earlier years
 * had no way in. But most of these newsrooms publish a sitemap: the same list
 * of addresses, served by the outlet itself, with the section and the date
 * spelled out in the path. It is a better source than the archive was, because
 * it is the publisher's own index rather than a third party's record of it.
 *
 * `index` is a sitemap index whose children hold the articles. `direct` is a
 * sitemap that holds them itself. Anything that needs a browser to render is
 * out of scope here; that is what the rendered-section collector is for.
 */

export interface SitemapSource {
  readonly outlet: string;
  readonly domain: string;
  readonly kind: 'index' | 'direct';
  readonly url: string;
  /** Only children whose address matches are followed, to spare the server. */
  readonly childPattern?: RegExp;
}

export const SITEMAPS: readonly SitemapSource[] = [
  {
    outlet: 'LA RAZÓN',
    domain: 'larazon.bo',
    kind: 'index',
    url: 'https://larazon.bo/sitemap_index.xml',
    childPattern: /post-sitemap\d*\.xml$/u,
  },
  {
    outlet: 'EL DEBER',
    domain: 'eldeber.com.bo',
    kind: 'index',
    url: 'https://eldeber.com.bo/sitemap.xml',
  },
  {
    outlet: 'OPINIÓN',
    domain: 'opinion.com.bo',
    kind: 'index',
    url: 'https://www.opinion.com.bo/sitemap.xml',
    childPattern: /sitemap.*\.xml/u,
  },
];

/**
 * The day an address states, when it states one.
 *
 * These newsrooms all put the date in the path — `/economia/2025/02/01/slug`.
 * A URL that does not is not dated by guessing: it is skipped, because a note
 * filed under the wrong year is worse for a reader comparing years than a note
 * that is not there.
 */
const DATED = /\/(20[12]\d)\/(\d{2})\/(\d{2})\//u;

export function dateFromPath(url: string): string | null {
  const match = DATED.exec(url);
  const year = match?.[1];
  const month = match?.[2];
  const day = match?.[3];
  if (!year || !month || !day) return null;
  if (month < '01' || month > '12' || day < '01' || day > '31') return null;
  return `${year}-${month}-${day}`;
}

/** The section the address files the piece under, as the outlet named it. */
export function sectionFromPath(url: string, domain: string): string {
  const path = url.split(domain)[1] ?? '';
  const first = path.split('/').filter(Boolean)[0] ?? '';
  return first.replace(/[-_]/gu, ' ').slice(0, 60) || 'Portada';
}
