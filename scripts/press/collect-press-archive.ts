import { existsSync, readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { SOURCES } from './archive-sources';
import type { Source } from './archive-sources';
import { readableHeadline } from './headline-spelling';

/**
 * Recovers Bolivian economic coverage from the public web archive.
 *
 * The outlets' feeds carry twenty-five items each, which is this week's mood
 * and not a record of the country. The archive holds what they published for
 * years — the span that contains the shortage, the gap opening and the
 * realignment — and its index answers with the address and the capture stamp of
 * every page it saw.
 *
 * What is recovered is a headline and a date, never a body. The archive is slow
 * enough that fetching each page would take days, and the address already
 * spells the headline out: news slugs are the headline with the spaces turned
 * to hyphens. The accents are lost, so the record says the headline was
 * reconstructed and no view quotes it.
 *
 * The index rate-limits, and it should: this is somebody's free service. So the
 * script accumulates rather than sweeping — each run adds what it can to the
 * year files already held, and running it again picks up more. Reaching back
 * across six outlets and seven years is a matter of repeated runs, not one
 * long one.
 *
 * Run with `yarn press:archive`.
 */

const SEEDS = join('src', 'database', 'seeds', 'boot');
const UA = 'Mozilla/5.0 (compatible; ObservatorioEconomicoBO/1.0)';
const INDEX = 'http://web.archive.org/cdx/search/cdx';

const YEARS = [2020, 2021, 2022, 2023, 2024, 2025, 2026] as const;

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

const LONG_ID = /\/(20[12]\d)(\d{2})(\d{2})\d{6,}/u;

/**
 * The headline the address spells out, with the spelling this corpus knows.
 *
 * The speller lives in its own module because two callers need the same
 * answer: this collector, when a page is first seen, and `press:respell`, when
 * the vocabulary grows. Recovering the words here and the accents there would
 * mean every fresh run wrote rows that read wrong until the second command ran.
 */
function headlineFrom(url: string): string | null {
  const path = url.split('?')[0]?.split('#')[0]?.replace(/\/+$/u, '') ?? '';
  const slug = (path.split('/').pop() ?? '').replace(/\.html?$/u, '').replace(/[_-]?\d{5,}$/u, '');
  return readableHeadline(slug);
}

/** The day the outlet published, where the address states one; else the capture day. */
function dateFor(url: string, stamp: string): { date: string; basis: 'URL' | 'ARCHIVO' } {
  const match = LONG_ID.exec(url);
  const year = match?.[1];
  const month = match?.[2];
  const day = match?.[3];
  if (year && month && day && year >= '2019' && year <= '2027' && month >= '01' && month <= '12') {
    return { date: `${year}-${month}-${day}`, basis: 'URL' };
  }
  return {
    date: `${stamp.slice(0, 4)}-${stamp.slice(4, 6)}-${stamp.slice(6, 8)}`,
    basis: 'ARCHIVO',
  };
}

/**
 * What one query to the index came back with, and whether it came back at all.
 *
 * "No captures" and "the index did not answer" are different facts and the
 * collector used to print both as `+0`. That is the same defect as a failed
 * request rendering as an empty result: it reports a successful run over a
 * service that refused every question. The index does refuse — it is somebody's
 * free service and it drops connections once a client has asked enough — so the
 * difference has to survive all the way to the summary.
 */
interface Answer {
  articles: Article[];
  refused: boolean;
}

async function query(source: Source, year: number): Promise<Answer> {
  const url =
    `${INDEX}?url=${source.pattern}&from=${year}&to=${year}&output=json` +
    `&collapse=urlkey&filter=statuscode:200&limit=6000`;
  let records: unknown[][] = [];
  let answered = false;
  for (let attempt = 0; attempt < 3; attempt += 1) {
    try {
      const response = await fetch(url, {
        headers: { 'User-Agent': UA },
        signal: AbortSignal.timeout(150_000),
      });
      if (!response.ok) throw new Error(String(response.status));
      const text = await response.text();
      const parsed: unknown = text.trim() ? JSON.parse(text) : [];
      records = Array.isArray(parsed) ? (parsed as unknown[][]).slice(1) : [];
      answered = true;
      break;
    } catch {
      await new Promise((resolve) => setTimeout(resolve, 5_000 * (attempt + 1)));
    }
  }
  if (!answered) return { articles: [], refused: true };

  const out: Article[] = [];
  for (const record of records) {
    // The index answers with rows of strings; anything else is not a capture.
    const rawStamp = record[1];
    const rawUrl = record[2];
    if (typeof rawStamp !== 'string' || typeof rawUrl !== 'string') continue;
    const stamp = rawStamp;
    const original = rawUrl.split('?')[0] ?? '';
    if (!/^\d{14}$/u.test(stamp) || !original.startsWith('http')) continue;
    const headline = headlineFrom(original);
    if (!headline || headline.length < 12) continue;
    const { date, basis } = dateFor(original, stamp);
    out.push({
      outlet: source.outlet,
      domain: source.domain,
      headline: headline.slice(0, 280),
      url: original.slice(0, 400),
      eventDate: date,
      dateBasis: basis,
      archiveTimestamp: stamp,
      archiveUrl: `https://web.archive.org/web/${stamp}/${original}`,
      excerpt: JSON.stringify(record).slice(0, 900),
    });
  }
  return { articles: out, refused: false };
}

function load(year: number): { provenance: Record<string, unknown>; articles: Article[] } {
  const path = join(SEEDS, `press-archive-${year}.json`);
  if (!existsSync(path)) {
    return {
      provenance: {
        publisher: 'INTERNET ARCHIVE',
        indexUrl: INDEX,
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
  // One record per line: tens of thousands of rows are machine output, and
  // pretty-printing them triples the size while hiding every change.
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
  let refusals = 0;
  let asked = 0;
  for (const source of SOURCES) {
    for (const year of YEARS) {
      const answer = await query(source, year);
      asked += 1;
      if (answer.refused) {
        refusals += 1;
        console.log(`  ${source.outlet.padEnd(16)} ${year}  sin respuesta del índice`);
        /*
         * Once the index has stopped answering it stays stopped for a while,
         * and a hundred further questions are neither useful nor polite. The
         * run ends and says so; it accumulates, so the next one picks up.
         */
        if (refusals >= 6) {
          console.log('\nEl índice dejó de responder. Se detiene la recolección.');
          break;
        }
        continue;
      }
      let fresh = 0;
      for (const article of answer.articles) {
        if (known.has(article.url)) continue;
        const bucket = files.get(Number(article.eventDate.slice(0, 4)) as (typeof YEARS)[number]);
        if (!bucket) continue;
        known.add(article.url);
        bucket.articles.push(article);
        fresh += 1;
      }
      added += fresh;
      console.log(`  ${source.outlet.padEnd(16)} ${year}  +${fresh}`);
      await new Promise((resolve) => setTimeout(resolve, 2_500));
    }
    if (refusals >= 6) break;
  }

  for (const [year, held] of files) if (held.articles.length) save(year, held);
  console.log(`\n${added} notas nuevas; ${known.size} en total`);
  console.log(
    refusals === 0
      ? `${asked} consultas, todas respondidas`
      : `${asked} consultas, ${refusals} sin respuesta: el resultado está incompleto`,
  );
  if (refusals > 0) process.exitCode = 2;
}

main().catch((error: unknown) => {
  process.stderr.write(`${error instanceof Error ? error.message : 'Archive collection failed'}\n`);
  process.exitCode = 1;
});
