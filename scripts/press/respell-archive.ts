import { existsSync, readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { readableHeadline } from './headline-spelling';

/**
 * Re-spells the headlines already recovered, without asking the archive again.
 *
 * The vocabulary the speller knows grows: a word that reads wrong today is a
 * line added to it. Re-fetching twenty thousand index records to apply that
 * would be rude to a free service and pointless besides — the addresses are
 * already held, and the address is what the headline comes from.
 *
 * Rows the speller can no longer make readable are dropped. A headline that is
 * nothing but identifiers was never a record of anything.
 *
 * Run with `yarn press:respell`.
 */

const SEEDS = join('src', 'database', 'seeds', 'boot');
const YEARS = [2020, 2021, 2022, 2023, 2024, 2025, 2026] as const;

interface Article {
  outlet: string;
  domain: string;
  headline: string;
  url: string;
  eventDate: string;
  dateBasis: string;
  archiveTimestamp: string;
  archiveUrl: string;
  excerpt: string;
}

/** The slug an address ends in, before any spelling is applied. */
function slugOf(url: string): string {
  const path = url.split('?')[0]?.split('#')[0]?.replace(/\/+$/u, '') ?? '';
  return (path.split('/').pop() ?? '').replace(/\.html?$/u, '').replace(/[_-]?\d{5,}$/u, '');
}

let kept = 0;
let dropped = 0;
let changed = 0;

for (const year of YEARS) {
  const path = join(SEEDS, `press-archive-${year}.json`);
  if (!existsSync(path)) continue;
  const held = JSON.parse(readFileSync(path, 'utf-8')) as {
    provenance: Record<string, unknown>;
    articles: Article[];
  };

  const articles: Article[] = [];
  for (const article of held.articles) {
    const headline = readableHeadline(slugOf(article.url));
    if (!headline) {
      dropped += 1;
      continue;
    }
    if (headline !== article.headline) changed += 1;
    articles.push({ ...article, headline: headline.slice(0, 280) });
    kept += 1;
  }

  articles.sort(
    (left, right) =>
      left.eventDate.localeCompare(right.eventDate) || left.url.localeCompare(right.url),
  );
  const body =
    `{"provenance":${JSON.stringify(held.provenance)},"articles":[\n` +
    `${articles.map((article) => JSON.stringify(article)).join(',\n')}\n]}\n`;
  writeFileSync(path, body, 'utf-8');
  process.stdout.write(`  ${year}  ${articles.length}\n`);
}

process.stdout.write(`\n${kept} conservadas, ${changed} reescritas, ${dropped} descartadas\n`);
