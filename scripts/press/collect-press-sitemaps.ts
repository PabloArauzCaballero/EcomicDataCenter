import { existsSync, readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { readableHeadline } from './headline-spelling';
import { SITEMAPS, dateFromPath, sectionFromPath } from './sitemap-sources';
import type { SitemapSource } from './sitemap-sources';

/**
 * Recovers earlier years from the outlets' own sitemaps.
 *
 * The public archive stopped answering, and the years before this one were
 * thin because of it: four mastheads for 2023 against ten for 2026, which made
 * a reader comparing two years compare two newspapers instead. The outlets
 * publish the same list themselves — section, year, month, day and slug in the
 * path — and serving it is what a sitemap is for.
 *
 * What is recovered is a headline and a date, never a body, exactly as the
 * archive collector recovered them: the address spells the headline out, and
 * the record says it was reconstructed so no view quotes it as the outlet's
 * own words. An address with no date in it is skipped rather than guessed at,
 * because a note filed under the wrong year is worse for a reader comparing
 * years than a note that is not there.
 *
 * It accumulates into the same year files the archive collector writes, keyed
 * on the address, so running both is safe and running this twice adds nothing.
 *
 * Run with `yarn press:sitemaps`.
 */

const SEEDS = join('src', 'database', 'seeds', 'boot');
const UA = 'Mozilla/5.0 (compatible; ObservatorioEconomicoBO/1.0)';
const YEARS = [2020, 2021, 2022, 2023, 2024, 2025, 2026] as const;
/** How many child sitemaps to read per outlet in one run; it accumulates. */
const CHILDREN_PER_RUN = 14;

interface Article {
  outlet: string;
  domain: string;
  headline: string;
  url: string;
  eventDate: string;
  dateBasis: 'URL' | 'ARCHIVO';
  archiveTimestamp: string;
  archiveUrl: string;
  excerpt: string;
}

/** Every `<loc>` a sitemap lists, or nothing when it would not answer. */
async function locations(url: string): Promise<string[]> {
  try {
    const response = await fetch(url, {
      headers: { 'User-Agent': UA },
      signal: AbortSignal.timeout(60_000),
    });
    if (!response.ok) return [];
    const body = await response.text();
    return [...body.matchAll(/<loc>\s*([^<\s]+)\s*<\/loc>/gu)].map((match) => match[1] ?? '');
  } catch {
    return [];
  }
}

/** The slug an address ends in, before any spelling is applied. */
function slugOf(url: string): string {
  const path = url.split('?')[0]?.split('#')[0]?.replace(/\/+$/u, '') ?? '';
  return (path.split('/').pop() ?? '').replace(/\.html?$/u, '');
}

function articleFrom(url: string, source: SitemapSource): Article | null {
  const eventDate = dateFromPath(url);
  if (!eventDate) return null;
  const headline = readableHeadline(slugOf(url));
  if (!headline || headline.length < 12) return null;
  return {
    outlet: source.outlet,
    domain: source.domain,
    headline: headline.slice(0, 280),
    url: url.slice(0, 400),
    eventDate,
    dateBasis: 'URL',
    archiveTimestamp: eventDate.replace(/-/gu, '') + '000000',
    archiveUrl: url.slice(0, 400),
    excerpt: JSON.stringify({
      sitemap: source.url,
      seccion: sectionFromPath(url, source.domain),
    }).slice(0, 900),
  };
}

function load(year: number): { provenance: Record<string, unknown>; articles: Article[] } {
  const path = join(SEEDS, `press-archive-${year}.json`);
  if (!existsSync(path)) {
    return {
      provenance: {
        publisher: 'SITEMAP DEL MEDIO',
        retrievedAt: `${new Date().toISOString().slice(0, 19)}Z`,
        year,
      },
      articles: [],
    };
  }
  return JSON.parse(readFileSync(path, 'utf-8')) as {
    provenance: Record<string, unknown>;
    articles: Article[];
  };
}

function save(
  year: number,
  held: { provenance: Record<string, unknown>; articles: Article[] },
): void {
  held.articles.sort(
    (left, right) =>
      left.eventDate.localeCompare(right.eventDate) || left.url.localeCompare(right.url),
  );
  const body =
    `{"provenance":${JSON.stringify(held.provenance)},"articles":[\n` +
    `${held.articles.map((article) => JSON.stringify(article)).join(',\n')}\n]}\n`;
  writeFileSync(join(SEEDS, `press-archive-${year}.json`), body, 'utf-8');
}

async function main(): Promise<void> {
  const files = new Map(YEARS.map((year) => [year, load(year)]));
  const known = new Set<string>();
  for (const held of files.values()) for (const article of held.articles) known.add(article.url);
  console.log(`ya guardadas: ${known.size}`);

  let added = 0;
  let mudos = 0;
  for (const source of SITEMAPS) {
    const children =
      source.kind === 'direct'
        ? [source.url]
        : (await locations(source.url))
            .filter((url) => !source.childPattern || source.childPattern.test(url))
            .slice(0, CHILDREN_PER_RUN);
    if (children.length === 0) {
      mudos += 1;
      console.log(`  ${source.outlet.padEnd(16)} sin respuesta del sitemap`);
      continue;
    }

    let fresh = 0;
    for (const child of children) {
      for (const url of await locations(child)) {
        if (known.has(url)) continue;
        const article = articleFrom(url, source);
        if (!article) continue;
        const bucket = files.get(Number(article.eventDate.slice(0, 4)) as (typeof YEARS)[number]);
        if (!bucket) continue;
        known.add(url);
        bucket.articles.push(article);
        fresh += 1;
      }
      // The outlet is serving this out of courtesy; one request per second.
      await new Promise((resolve) => setTimeout(resolve, 1_000));
    }
    added += fresh;
    console.log(`  ${source.outlet.padEnd(16)} ${children.length} sitemaps  +${fresh}`);
  }

  for (const [year, held] of files) if (held.articles.length) save(year, held);
  console.log(`\n${added} notas nuevas; ${known.size} en total`);
  if (mudos > 0) {
    console.log(`${mudos} medios no respondieron: el resultado está incompleto`);
    process.exitCode = 2;
  }
}

main().catch((error: unknown) => {
  process.stderr.write(`${error instanceof Error ? error.message : 'Sitemap collection failed'}\n`);
  process.exitCode = 1;
});
