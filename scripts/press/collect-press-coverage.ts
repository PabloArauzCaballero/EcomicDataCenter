import { chromium } from 'playwright';
import { createHash } from 'node:crypto';
import { writeFileSync } from 'node:fs';
import { join } from 'node:path';
import {
  BROWSER_UA,
  FEEDS,
  RENDERED,
  STALE_DAYS,
  UA,
  clean,
  field,
  inBolivia,
  parseStamp,
  type Collected,
  type Discovered,
} from './press-sources';

/**
 * Rebuilds `src/database/seeds/boot/press-coverage.json` from the outlets.
 *
 * Five outlets syndicate a feed and are read over plain HTTP. Two do not —
 * Unitel publishes none and Red Uno's stopped being written in 2022 — so their
 * sections are rendered once and the publication date is read from each
 * article's own structured block, never from the URL slug: a slug with digits
 * in it is not a stamp its publisher stands behind.
 *
 * See ADR-0019. Run with `yarn press:collect`.
 */

const SEED = join('src', 'database', 'seeds', 'boot', 'press-coverage.json');

async function readFeeds(): Promise<Collected[]> {
  const rows: Collected[] = [];
  for (const [outlet, domain, section, url] of FEEDS) {
    const response = await fetch(url, {
      headers: { 'User-Agent': UA },
      signal: AbortSignal.timeout(45_000),
    });
    if (!response.ok) {
      console.warn(`  ${outlet} ${section}: HTTP ${response.status}, omitido`);
      continue;
    }
    const bytes = Buffer.from(await response.arrayBuffer());
    const digest = createHash('sha256').update(bytes).digest('hex');
    const found: Collected[] = [];
    for (const item of bytes.toString('utf-8').match(/<item[\s>][\s\S]*?<\/item>/gu) ?? []) {
      const link = field(item, 'link', 'guid');
      const headline = field(item, 'title');
      const stamp = parseStamp(field(item, 'pubDate', 'published', 'dc:date'));
      if (!link.startsWith('http') || headline.length < 12 || !stamp) continue;
      found.push({
        outlet,
        domain,
        section,
        headline: headline.slice(0, 300),
        summary: field(item, 'description', 'summary').slice(0, 1200),
        url: (link.split('?')[0] ?? link).slice(0, 500),
        statedDate: field(item, 'pubDate', 'published', 'dc:date').slice(0, 80),
        stamp,
        retrievalMethod: 'SYNDICATED_FEED',
        listingUrl: url,
        listingSha256: digest,
        excerpt: item.replace(/\s+/gu, ' ').slice(0, 3500),
      });
    }
    const newest = found.reduce<Date | null>(
      (best, row) => (!best || row.stamp > best ? row.stamp : best),
      null,
    );
    const age = newest ? (Date.now() - newest.getTime()) / 86_400_000 : Infinity;
    if (age > STALE_DAYS) {
      console.warn(
        `  ${outlet} ${section}: feed sin escribir hace ${Math.round(age)} días, omitido`,
      );
      continue;
    }
    console.log(`  ${outlet.padEnd(17)} ${section.padEnd(9)} ${found.length} notas`);
    rows.push(...found);
  }
  return rows;
}

async function readRendered(): Promise<Discovered[]> {
  const browser = await chromium.launch();
  const page = await browser.newPage({ viewport: { width: 1440, height: 1400 } });
  const rows: Discovered[] = [];
  try {
    for (const outlet of RENDERED) {
      for (const [section, url] of outlet.sections) {
        // A section that will not load costs that section, never the run: the
        // five syndicated outlets are unaffected and the gap is visible as zero
        // notes from this one.
        try {
          await page.goto(url, { waitUntil: 'domcontentloaded', timeout: 60_000 });
          await page.waitForLoadState('networkidle', { timeout: 20_000 }).catch(() => undefined);
        } catch {
          console.warn(`  ${outlet.outlet} ${section}: no cargó, omitido`);
          continue;
        }
        await page.waitForTimeout(2200);
        const digest = createHash('sha256')
          .update(await page.content())
          .digest('hex');
        const found = await page.evaluate(() =>
          [...document.querySelectorAll('a[href]')]
            .map((anchor) => ({
              href: anchor.getAttribute('href') ?? '',
              title: (anchor.textContent ?? '').replace(/\s+/g, ' ').trim(),
              card: (anchor.closest('article, li, div')?.textContent ?? '')
                .replace(/\s+/g, ' ')
                .trim()
                .slice(0, 600),
            }))
            .filter((row) => row.title.length > 28 && !row.title.includes('<')),
        );
        const seen = new Set();
        for (const row of found) {
          if (!outlet.match.test(row.href)) continue;
          const link =
            (row.href.startsWith('http') ? row.href : outlet.prefix + row.href).split('?')[0] ?? '';
          if (seen.has(link)) continue;
          seen.add(link);
          rows.push({
            outlet: outlet.outlet,
            domain: outlet.domain,
            section,
            headline: clean(row.title).slice(0, 300),
            summary: clean(row.card.replace(row.title, '')).slice(0, 1200),
            url: link.slice(0, 500),
            statedDate: '',
            retrievalMethod: 'RENDERED_SECTION',
            listingUrl: url,
            listingSha256: digest,
            excerpt: row.card.slice(0, 3500),
          });
        }
        console.log(`  ${outlet.outlet.padEnd(17)} ${section.padEnd(9)} ${seen.size} notas`);
      }
    }
  } finally {
    await browser.close();
  }
  return rows;
}

/** The date and standfirst each rendered article states on its own page. */
async function datesFromArticles(rows: Discovered[]): Promise<Collected[]> {
  const kept: Collected[] = [];
  for (const row of rows) {
    try {
      const response = await fetch(row.url, {
        headers: { 'User-Agent': BROWSER_UA },
        signal: AbortSignal.timeout(45_000),
      });
      if (!response.ok) continue;
      const bytes = Buffer.from(await response.arrayBuffer());
      const body = bytes.toString('utf-8');
      let record: Record<string, unknown> | null = null;
      for (const block of body.match(
        /<script[^>]+application\/ld\+json[^>]*>([\s\S]*?)<\/script>/gu,
      ) ?? []) {
        const inner = block.replace(/^[\s\S]*?>/u, '').replace(/<\/script>$/u, '');
        let parsed: unknown;
        try {
          parsed = JSON.parse(inner);
        } catch {
          continue;
        }
        const candidates: unknown[] = Array.isArray(parsed) ? parsed : [parsed];
        record =
          candidates.find(
            (entry): entry is Record<string, unknown> =>
              typeof entry === 'object' &&
              entry !== null &&
              typeof (entry as Record<string, unknown>)['datePublished'] === 'string',
          ) ?? null;
        if (record) break;
      }
      if (!record) continue;
      const stamp = parseStamp(String(record['datePublished']));
      if (!stamp) continue;
      kept.push({
        ...row,
        statedDate: String(record['datePublished']).slice(0, 80),
        stamp,
        listingSha256: createHash('sha256').update(bytes).digest('hex'),
        summary:
          typeof record.description === 'string'
            ? clean(record.description).slice(0, 1200)
            : row.summary,
        excerpt: JSON.stringify(record).slice(0, 3500),
      });
      await new Promise((resolve) => setTimeout(resolve, 300));
    } catch {
      // One unreachable article is not a reason to lose the rest.
    }
  }
  return kept;
}

async function main(): Promise<void> {
  console.log('Feeds sindicados:');
  const feeds = await readFeeds();
  console.log('Secciones renderizadas:');
  const rendered = await datesFromArticles(await readRendered());

  const seen = new Set<string>();
  const articles = [...feeds, ...rendered]
    .filter((row) => row.headline.length >= 12 && row.excerpt.length >= 20)
    .filter((row) => !seen.has(row.url) && Boolean(seen.add(row.url)))
    .map((row) => {
      const local = inBolivia(row.stamp);
      return {
        outlet: row.outlet,
        domain: row.domain,
        section: row.section,
        headline: row.headline,
        summary: row.summary,
        url: row.url,
        statedDate: row.statedDate,
        publishedAt: `${local.toISOString().slice(0, 19)}-04:00`,
        eventDate: local.toISOString().slice(0, 10),
        retrievalMethod: row.retrievalMethod,
        listingUrl: row.listingUrl,
        listingSha256: row.listingSha256,
        excerpt: row.excerpt,
      };
    })
    .sort((left, right) => right.publishedAt.localeCompare(left.publishedAt));

  writeFileSync(
    SEED,
    `${JSON.stringify({ provenance: { retrievedAt: `${new Date().toISOString().slice(0, 19)}Z` }, articles }, null, 2)}\n`,
    'utf-8',
  );
  const byOutlet = new Map<string, number>();
  for (const article of articles)
    byOutlet.set(article.outlet, (byOutlet.get(article.outlet) ?? 0) + 1);
  console.log(`\n${articles.length} notas de ${byOutlet.size} medios escritas en ${SEED}`);
  for (const [outlet, count] of [...byOutlet].sort((left, right) => right[1] - left[1])) {
    console.log(`  ${outlet.padEnd(18)} ${count}`);
  }
}

main().catch((error: unknown) => {
  process.stderr.write(`${error instanceof Error ? error.message : 'Press collection failed'}
`);
  process.exitCode = 1;
});
