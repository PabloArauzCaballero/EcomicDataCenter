import { existsSync, mkdirSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { ROOT, atomicJson, capture, capturedText, type Capture } from './http';
import { buildIssuers, matchIssuers } from './issuers';
import { legacyEntries, normalizeLegacy, type LegacyEntry } from './legacy';
import { plain } from './text';

interface LegacyState {
  version?: number;
  categories: Array<{ id: number; name: string; lastStart: number; captures: Capture[]; complete: boolean }>;
  entries: LegacyEntry[]; documents: Record<string, Capture>; failures: Record<string, string>;
}
export async function collectLegacy(allDetails: boolean, maxPages = 40, maxDetails = 100): Promise<void> {
  mkdirSync(ROOT, { recursive: true });
  const path = join(ROOT, 'legacy-inventory.json');
  const state: LegacyState = existsSync(path) ? JSON.parse(readFileSync(path, 'utf8')) as LegacyState
    : { categories: [], entries: [], documents: {}, failures: {} };
  // Joomla's blog template displays ten links even when limit=1000 is accepted.
  // Old captures remain as evidence, but cannot certify pagination coverage.
  if (state.version !== 2) {
    state.version = 2;
    state.categories = state.categories.map(c => ({ ...c, lastStart: 0, captures: [], complete: false }));
    state.entries = [];
  }
  if (!state.categories.length) {
    const robots = await capture('https://historico.abi.bo/robots.txt');
    if (/Disallow:\s*\/\s*$/mu.test(capturedText(robots))) throw new Error('Historical ABI robots disallows crawling');
    const result = await capture('https://historico.abi.bo/index.php?option=com_content&view=categories&id=0');
    const html = capturedText(result);
    for (const m of html.matchAll(/<h3\b[^>]*class="page-header item-title"[^>]*>([\s\S]*?)<\/h3>/gu)) {
      const id = Number(m[1]!.match(/\/category\/(\d+)-/u)?.[1]);
      const name = plain(m[1]!.split('</a>')[0] ?? '');
      if (id && ![20, 33, 57].includes(id)) state.categories.push({ id, name, lastStart: 0, captures: [], complete: false });
    }
    // These menu routes use aliases; their category identifiers are read from a public category index separately.
    atomicJson(path, state);
  }
  const found = new Map(state.entries.map(e => [e.id, e]));
  let pagesRead = 0;
  for (const category of [...state.categories].sort((a, b) => Number(b.id === 36) - Number(a.id === 36))) {
    if (category.complete) continue;
    let last = category.lastStart;
    for (let start = category.captures.length * 10; start <= last && pagesRead < maxPages; start += 10) {
      const url = `https://historico.abi.bo/index.php?option=com_content&view=category&id=${category.id}&layout=default&limit=10&start=${start}`;
      const result = await capture(url), html = capturedText(result);
      if (!html.includes('<html')) throw new Error('Historical ABI returned an empty category');
      const offsets = [...html.matchAll(/(?:start=|limitstart=)(\d+)/gu)].map(m => Number(m[1]));
      last = Math.max(start, ...offsets); category.lastStart = last;
      const entries = legacyEntries(html, category.id, category.name);
      if (!entries.length && last > 0) throw new Error(`Legacy category ${category.id} has no readable links`);
      if (start < last && entries.length < 10) throw new Error(`Historical listing returned only ${entries.length}/10 entries; refusing to skip records`);
      for (const e of entries) found.set(e.id, e);
      category.captures.push(result); category.complete = start >= last;
      pagesRead++;
      state.entries = [...found.values()]; atomicJson(path, state);
      console.log(`ABI legacy ${category.name} ${start}/${last}: ${entries.length} links`);
    }
  }
  const issuers = buildIssuers();
  // Full detail mode is resumable and visits every discovered public article.
  // The company pass prioritises explicit issuer names, with its coverage reported separately.
  const candidates = state.entries.filter(e => allDetails || matchIssuers(e.title, '', issuers).length > 0)
    .sort((a, b) => Number(matchIssuers(b.title, '', issuers).length > 0) - Number(matchIssuers(a.title, '', issuers).length > 0));
  mkdirSync(join(ROOT, 'legacy-articles'), { recursive: true });
  let completed = 0;
  let fetched = 0;
  for (const entry of candidates) {
    try {
      let document = state.documents[String(entry.id)];
      if (!document) {
        if (fetched >= maxDetails) continue;
        document = await capture(entry.url); state.documents[String(entry.id)] = document; fetched++;
      }
      const article = normalizeLegacy(capturedText(document), entry, document, issuers);
      atomicJson(join(ROOT, 'legacy-articles', `${entry.id}.json`), { schemaVersion: '1.0', articles: [article] });
      delete state.failures[String(entry.id)];
    } catch (error) { state.failures[String(entry.id)] = error instanceof Error ? error.message : String(error); }
    completed++; if (completed % 20 === 0) { atomicJson(path, state); console.log(`ABI legacy details ${completed}/${candidates.length}`); }
  }
  atomicJson(path, state);
  atomicJson(join(ROOT, 'legacy-coverage.json'), { mode: allDetails ? 'ALL_DETAILS' : 'ISSUER_TITLES',
    inventoryComplete: state.categories.every(c => c.complete), inventoryParser: 'joomla-ten-links-v2',
    discovered: state.entries.length, targeted: candidates.length, downloaded: Object.keys(state.documents).length,
    failures: state.failures, remainingBodies: state.entries.length - Object.keys(state.documents).length,
    categories: state.categories.map(c => ({ id: c.id, name: c.name, complete: c.complete })), retrievedAt: new Date().toISOString() });
  if (Object.keys(state.failures).length) throw new Error(`Legacy ABI has ${Object.keys(state.failures).length} failed documents`);
}
const limit = (key: string, fallback: number): number => {
  const value = process.argv.find(a => a.startsWith(`--${key}=`))?.split('=')[1];
  const n = value === undefined ? fallback : Number(value);
  if (!Number.isSafeInteger(n) || n < 0) throw new Error(`Invalid ${key}`);
  return n;
};
if (require.main === module) collectLegacy(!process.argv.includes('--issuer-only'), limit('max-pages', 40), limit('max-details', 100)).catch((error: unknown) => {
  console.error(error instanceof Error ? error.message : error); process.exitCode = 1;
});
