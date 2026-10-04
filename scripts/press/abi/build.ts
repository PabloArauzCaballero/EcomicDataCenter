import { existsSync, mkdirSync, readFileSync, readdirSync } from 'node:fs';
import { join } from 'node:path';
import {
  abiNewsShardSchema,
  type AbiArticle,
  type AbiTerm,
} from '../../../src/database/seeds/schemas/abi-news.schema';
import { ROOT, atomicJson, capturedText, type Capture } from './http';
import { buildIssuers } from './issuers';
import { normalizeWp } from './normalize';
import type { WpInventory } from './collect-wordpress';

export function buildAbi(): void {
  const inventory = JSON.parse(readFileSync(join(ROOT, 'wordpress.json'), 'utf8')) as WpInventory;
  if (!inventory.complete) throw new Error('ABI inventory incomplete');
  const taxonomy = JSON.parse(readFileSync(join(ROOT, 'taxonomy.json'), 'utf8')) as Record<
    string,
    Capture[]
  >;
  const terms = (kind: string): Map<number, AbiTerm> =>
    new Map(
      (taxonomy[kind] ?? []).flatMap((c) =>
        (JSON.parse(capturedText(c)) as Array<AbiTerm>).map(
          ({ id, name, slug }) => [id, { id, name, slug }] as const,
        ),
      ),
    );
  const issuers = buildIssuers();
  const categories = terms('categories');
  const tags = terms('tags');
  atomicJson(join(ROOT, 'issuers.json'), issuers);
  const latest = new Map<number, { raw: unknown; source: Capture }>();
  for (const source of [...inventory.captures].sort((a, b) =>
    a.retrievedAt.localeCompare(b.retrievedAt),
  )) {
    for (const raw of JSON.parse(capturedText(source)) as Array<{ id: number }>)
      latest.set(raw.id, { raw, source });
  }
  const articles: AbiArticle[] = [];
  const rejected: Array<{ id: number; reason: string; responseSha256: string }> = [];
  for (const [id, row] of latest) {
    try {
      articles.push(normalizeWp(row.raw, row.source, categories, tags, issuers));
    } catch (error) {
      rejected.push({
        id,
        reason: error instanceof Error ? error.message : String(error),
        responseSha256: row.source.sha256,
      });
    }
  }
  const legacyPath = join(ROOT, 'legacy-articles');
  if (existsSync(legacyPath))
    for (const file of readdirSync(legacyPath).filter((f) => f.endsWith('.json'))) {
      const shard = abiNewsShardSchema.parse(
        JSON.parse(readFileSync(join(legacyPath, file), 'utf8')),
      );
      articles.push(...shard.articles);
    }
  const sitemaps = JSON.parse(readFileSync(join(ROOT, 'sitemaps.json'), 'utf8')) as Capture[];
  const urls = new Set(
    sitemaps
      .slice(1)
      .flatMap((c) => [...capturedText(c).matchAll(/<loc>([^<]+)<\/loc>/gu)].map((m) => m[1]!))
      .filter((u) => u !== 'https://abi.bo/'),
  );
  const held = new Set(
    articles.filter((a) => a.edition === 'CURRENT').flatMap((a) => [a.url, a.canonicalUrl]),
  );
  const missing = [...urls].filter((url) => !held.has(url));
  const byMonth = new Map<string, AbiArticle[]>();
  for (const article of articles.sort((a, b) => a.key.localeCompare(b.key))) {
    const month = `${article.edition.toLowerCase()}-${article.publicationDay.slice(0, 7)}`;
    const rows = byMonth.get(month) ?? [];
    rows.push(article);
    byMonth.set(month, rows);
  }
  mkdirSync(join(ROOT, 'articles'), { recursive: true });
  const files: string[] = [];
  for (const [month, rows] of byMonth) {
    for (let start = 0; start < rows.length; start += 1000) {
      const name = `articles/${month}-${String(start / 1000 + 1).padStart(3, '0')}.json`;
      atomicJson(
        join(ROOT, name),
        abiNewsShardSchema.parse({
          schemaVersion: '1.0',
          articles: rows.slice(start, start + 1000),
        }),
      );
      files.push(name);
    }
  }
  // The manifest is the sole authoritative list; stale files are never loaded.
  const report = {
    schemaVersion: '1.0',
    retrievedAt: new Date().toISOString(),
    cutoff: inventory.cutoff,
    currentIds: latest.size,
    articles: articles.length,
    rejected: rejected.length,
    companyArticles: articles.filter((a) => a.mentions.length).length,
    issuerCount: new Set(articles.flatMap((a) => a.mentions.map((m) => m.filerCode))).size,
    dateConflicts: articles.filter((a) => a.dateQuality === 'CONFLICT').length,
    earliestDay: articles.map((a) => a.publicationDay).sort()[0],
    latestDay: articles
      .map((a) => a.publicationDay)
      .sort()
      .at(-1),
    sitemapUrls: urls.size,
    sitemapMissing: missing,
    outsideSitemap: [...held].filter((u) => !urls.has(u)),
    files,
    complete: rejected.length === 0 && missing.length === 0,
  };
  atomicJson(join(ROOT, 'rejected.json'), rejected);
  atomicJson(join(ROOT, 'manifest.json'), report);
  console.log(
    JSON.stringify({
      ...report,
      files: files.length,
      sitemapMissing: missing.length,
      outsideSitemap: report.outsideSitemap.length,
    }),
  );
  if (rejected.length)
    throw new Error(`ABI rejected ${rejected.length} records; see rejected.json`);
}
if (require.main === module) {
  try {
    buildAbi();
  } catch (e) {
    console.error(e);
    process.exitCode = 1;
  }
}
