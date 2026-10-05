import { existsSync, mkdirSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { ROOT, atomicJson, capture, capturedText, type Capture } from './http';

export interface WpInventory {
  cutoff: string;
  complete: boolean;
  captures: Capture[];
  expected: number;
}
const fields =
  'id,date,date_gmt,modified,modified_gmt,slug,status,type,link,title,content,excerpt,author,featured_media,categories,tags,meta,acf,yoast_head_json,_links,_embedded';

/** Detect filtered-out embedding before publishing an apparently complete capture. */
export function assertEmbeddedResponse(records: unknown[]): void {
  for (const record of records) {
    if (!record || typeof record !== 'object' || !('_links' in record))
      throw new Error('ABI response lacks link metadata required for embedded resources');
    const post = record as {
      id?: number;
      author?: number;
      featured_media?: number;
      _embedded?: unknown;
    };
    if (((post.author ?? 0) > 0 || (post.featured_media ?? 0) > 0) && !post._embedded)
      throw new Error(`ABI post ${post.id} lacks requested embedded metadata`);
  }
}

/** A bounded modified window prevents new posts shifting pages during a run. */
async function collectPosts(full: boolean): Promise<void> {
  const path = join(ROOT, 'wordpress.json');
  const previous: WpInventory | null = existsSync(path)
    ? (JSON.parse(readFileSync(path, 'utf8')) as WpInventory)
    : null;
  const pendingPath = join(ROOT, 'pending-wordpress.json');
  const pending: WpInventory = existsSync(pendingPath)
    ? (JSON.parse(readFileSync(pendingPath, 'utf8')) as WpInventory)
    : { cutoff: new Date().toISOString().slice(0, 19), complete: false, captures: [], expected: 0 };
  const base = new URL('https://abi.bo/wp-json/wp/v2/posts');
  base.searchParams.set('per_page', '100');
  base.searchParams.set('orderby', 'id');
  base.searchParams.set('order', 'asc');
  base.searchParams.set('_embed', 'author,wp:featuredmedia');
  base.searchParams.set('_fields', fields);
  base.searchParams.set('modified_before', pending.cutoff);
  if (previous?.complete && !full) {
    // Overlap covers equal timestamps and imports corrected after discovery.
    base.searchParams.set(
      'modified_after',
      new Date(Date.parse(`${previous.cutoff}Z`) - 3 * 86400000).toISOString().slice(0, 19),
    );
  }
  let pages = pending.captures[0]?.pages ?? 1;
  for (let page = pending.captures.length + 1; page <= pages; page++) {
    base.searchParams.set('page', String(page));
    const result = await capture(base.href);
    const records: unknown = JSON.parse(capturedText(result));
    if (!Array.isArray(records) || result.total === null || result.pages === null)
      throw new Error('ABI posts response lacks array/pagination headers');
    assertEmbeddedResponse(records);
    if (page === 1) {
      pending.expected = result.total;
      pages = result.pages;
    }
    if (result.total !== pending.expected)
      throw new Error('ABI inventory changed within bounded window; rerun full reconciliation');
    pending.captures.push(result);
    atomicJson(pendingPath, pending);
    console.log(`ABI posts ${page}/${Math.max(1, pages)} (${records.length})`);
  }
  const count = pending.captures.reduce(
    (n, c) => n + (JSON.parse(capturedText(c)) as unknown[]).length,
    0,
  );
  if (count !== pending.expected)
    throw new Error(`ABI incomplete window: ${count}/${pending.expected}`);
  pending.complete = true;
  // Captures remain immutable, including previous versions needed for audit.
  const captures = [...(previous?.captures ?? []), ...pending.captures];
  atomicJson(path, {
    ...pending,
    captures: [...new Map(captures.map((c) => [c.sha256, c])).values()],
  });
  // Keep no stale resume state after a successful atomic publication.
  const { unlinkSync } = await import('node:fs');
  unlinkSync(pendingPath);
}

export async function collectWordpress(full: boolean): Promise<void> {
  mkdirSync(ROOT, { recursive: true });
  const robots = await capture('https://abi.bo/robots.txt');
  if (/Disallow:\s*\/\s*$/mu.test(capturedText(robots)))
    throw new Error('ABI robots disallows crawling');
  await collectPosts(full);
  const taxonomy: Record<string, Capture[]> = {};
  for (const kind of ['categories', 'tags']) {
    const captures: Capture[] = [];
    let pages = 1;
    for (let page = 1; page <= pages; page++) {
      const result = await capture(
        `https://abi.bo/wp-json/wp/v2/${kind}?per_page=100&page=${page}&_fields=id,name,slug,count,parent,link,description`,
      );
      if (result.pages === null) throw new Error(`ABI ${kind} lacks pagination`);
      pages = result.pages;
      captures.push(result);
    }
    taxonomy[kind] = captures;
    console.log(`ABI ${kind}: ${captures.length} pages`);
  }
  atomicJson(join(ROOT, 'taxonomy.json'), taxonomy);
  const index = await capture('https://abi.bo/sitemap_index.xml');
  const children = [
    ...capturedText(index).matchAll(/<loc>(https:\/\/abi\.bo\/post-sitemap\d*\.xml)<\/loc>/gu),
  ].map((m) => m[1]!);
  if (!children.length) throw new Error('ABI sitemap has no post indices');
  const sitemaps = [index];
  for (const url of children) sitemaps.push(await capture(url));
  atomicJson(join(ROOT, 'sitemaps.json'), sitemaps);
  atomicJson(join(ROOT, 'rss.json'), await capture('https://abi.bo/feed/'));
}

if (require.main === module)
  collectWordpress(process.argv.includes('--full')).catch((error: unknown) => {
    console.error(error instanceof Error ? error.message : error);
    process.exitCode = 1;
  });
