import {
  abiArticleSchema,
  type AbiArticle,
} from '../../../src/database/seeds/schemas/abi-news.schema';
import { type Capture, sha } from './http';
import { matchIssuers, type Issuer } from './issuers';
import { attributes, links, plain, quantities, safeLink, topics } from './text';

export interface LegacyEntry {
  id: number;
  title: string;
  url: string;
  categoryId: number;
  category: string;
}
export function legacyEntries(html: string, categoryId: number, category: string): LegacyEntry[] {
  const entries = new Map<number, LegacyEntry>();
  // List articles occur before pagination; exclude sidebar recommendations.
  const main = html.split('pagination-wrapper')[0] ?? html;
  for (const m of main.matchAll(/<a\b([^>]*)>([\s\S]*?)<\/a>/giu)) {
    const href = attributes(m[1]!).href;
    if (!href || !href.startsWith('/index.php/')) continue;
    const id = Number(href.match(/\/(\d{3,})-[^/]+(?:\?|$)/u)?.[1]);
    const title = plain(m[2]!);
    if (!id || title.length < 12 || /^Leer m[aá]s/iu.test(title) || /<img/iu.test(m[2]!)) continue;
    const url = safeLink(href, 'https://historico.abi.bo');
    if (url && !entries.has(id)) entries.set(id, { id, title, url, categoryId, category });
  }
  return [...entries.values()];
}
function bodyElement(html: string): string {
  const start = /<div\b[^>]*itemprop=["']articleBody["'][^>]*>/iu.exec(html);
  if (!start) throw new Error('Legacy article has no articleBody');
  const rest = html.slice(start.index + start[0].length);
  let depth = 1;
  for (const tag of rest.matchAll(/<\/?div\b[^>]*>/giu)) {
    depth += tag[0].startsWith('</') ? -1 : 1;
    if (depth === 0) return rest.slice(0, tag.index);
  }
  throw new Error('Legacy articleBody not closed');
}
export function normalizeLegacy(
  html: string,
  entry: LegacyEntry,
  source: Capture,
  issuers: Issuer[],
): AbiArticle {
  const title = plain(html.match(/<h1\b[^>]*>([\s\S]*?)<\/h1>/iu)?.[1] ?? '');
  if (!title) throw new Error('Legacy article lacks title');
  const stamp = [...html.matchAll(/<time\b[^>]*>/giu)]
    .map((m) => attributes(m[0]))
    .find((a) => a.itemprop === 'datePublished')?.datetime;
  if (
    !stamp ||
    !/^\d{4}-\d{2}-\d{2}T[\d:]+(?:Z|[+-]\d{2}:\d{2})$/u.test(stamp) ||
    Number.isNaN(Date.parse(stamp))
  )
    throw new Error('Legacy article lacks timestamp with offset');
  const contentHtml = bodyElement(html),
    text = plain(contentHtml);
  const category = plain(
    html.match(/<a\b[^>]*itemprop=["']genre["'][^>]*>([\s\S]*?)<\/a>/iu)?.[1] ?? entry.category,
  );
  const authorBlock =
    html.match(/<dd\b[^>]*class=["']createdby["'][^>]*>([\s\S]*?)<\/dd>/iu)?.[1] ?? '';
  const author = plain(authorBlock.match(/<span\b[^>]*>([\s\S]*?)<\/span>/iu)?.[1] ?? '') || null;
  const images: AbiArticle['images'] = [];
  const imageRegion =
    html.match(
      /<div class="(?:entry-image|article-image)[\s\S]*?(?=<div class="entry-header")/iu,
    )?.[0] ?? contentHtml;
  for (const image of imageRegion.matchAll(/<img\b[^>]*>/giu)) {
    const a = attributes(image[0]);
    const url = a.src ? safeLink(a.src, entry.url) : null;
    if (url && !images.some((i) => i.url === url))
      images.push({ url, alt: a.alt ?? '', caption: '' });
  }
  const normalized = {
    key: `abi:legacy:${entry.id}`,
    sourceId: entry.id,
    edition: 'HISTORICAL',
    url: entry.url,
    canonicalUrl: entry.url,
    title,
    summary: text.split('\n').find((p) => p.length > 40) ?? '',
    contentHtml,
    text,
    contentStatus: text.length >= 20 ? 'TEXT' : images.length ? 'MEDIA_ONLY' : 'EMPTY',
    publishedAt: stamp,
    publicationDay: stamp.slice(0, 10),
    modifiedAt: null,
    statedDate: stamp,
    statedDateGmt: null,
    statedModified: null,
    dateQuality: 'CONSISTENT',
    categories: [{ id: entry.categoryId, name: category, slug: category.toLowerCase() }],
    tags: [],
    author: { id: null, name: author },
    images,
    links: links(contentHtml, entry.url),
    mentions: matchIssuers(title, text, issuers),
    topics: topics(`${title}\n${text}`),
    quantities: quantities(text),
    dateline: text.match(/^([^\n]{5,180}?\(ABI\)[^\w]*)/u)?.[1]?.trim() ?? null,
    parserVersion: 'abi-v1',
  };
  return abiArticleSchema.parse({
    ...normalized,
    contentSha256: sha(JSON.stringify(normalized)),
    retrievedAt: source.retrievedAt,
    responseUrl: source.url,
    responseSha256: source.sha256,
    responseStorage: source.storage,
  });
}
