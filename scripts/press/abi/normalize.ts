import { z } from 'zod';
import { abiArticleSchema, type AbiArticle, type AbiTerm } from '../../../src/database/seeds/schemas/abi-news.schema';
import { type Capture, sha } from './http';
import { matchIssuers, type Issuer } from './issuers';
import { attributes, links, plain, quantities, safeLink, topics } from './text';

const rendered = z.object({ rendered: z.string() });
const wpPost = z.object({
  id: z.number().int().positive(), date: z.string(), date_gmt: z.string(),
  modified: z.string(), modified_gmt: z.string(), link: z.url(), status: z.literal('publish'),
  title: rendered, content: rendered, excerpt: rendered, author: z.number(),
  categories: z.array(z.number()), tags: z.array(z.number()),
  _embedded: z.object({
    author: z.array(z.object({ id: z.number(), name: z.string() })).optional(),
    'wp:featuredmedia': z.array(z.object({
      source_url: z.string().optional(), alt_text: z.string().optional(), caption: rendered.optional(),
    }).passthrough()).optional(),
  }).optional(),
  yoast_head_json: z.object({ canonical: z.string().optional() }).optional(),
});

export function dates(local: string, utc: string): Pick<AbiArticle, 'publishedAt' | 'publicationDay' | 'dateQuality'> {
  const shape = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}$/u;
  if (!shape.test(local) || Number.isNaN(Date.parse(`${local}Z`)) || new Date(`${local}Z`).toISOString().slice(0, 19) !== local)
    throw new Error(`Invalid publication date ${local}`);
  const assumed = `${local}-04:00`;
  const consistent = shape.test(utc) && Date.parse(assumed) === Date.parse(`${utc}Z`);
  return { publicationDay: local.slice(0, 10), publishedAt: consistent ? assumed : null,
    dateQuality: consistent ? 'CONSISTENT' : 'CONFLICT' };
}

export function normalizeWp(
  input: unknown, source: Capture, categories: Map<number, AbiTerm>, tags: Map<number, AbiTerm>, issuers: Issuer[],
): AbiArticle {
  const row = wpPost.parse(input);
  const url = safeLink(row.link, 'https://abi.bo');
  if (!url || new URL(url).hostname !== 'abi.bo') throw new Error('ABI article points outside publisher');
  const canonical = safeLink(row.yoast_head_json?.canonical ?? row.link, url);
  const canonicalUrl = canonical && new URL(canonical).hostname === 'abi.bo' ? canonical : url;
  const title = plain(row.title.rendered);
  const text = plain(row.content.rendered);
  const images: AbiArticle['images'] = [];
  for (const media of row._embedded?.['wp:featuredmedia'] ?? []) {
    const imageUrl = media.source_url ? safeLink(media.source_url, url) : null;
    if (imageUrl) images.push({ url: imageUrl, alt: plain(media.alt_text ?? ''), caption: plain(media.caption?.rendered ?? '') });
  }
  for (const match of row.content.rendered.matchAll(/<img\b[^>]*>/giu)) {
    const attrs = attributes(match[0]);
    const imageUrl = safeLink(attrs.src ?? '', url);
    if (imageUrl && attrs.src && !images.some(i => i.url === imageUrl))
      images.push({ url: imageUrl, alt: attrs.alt ?? '', caption: '' });
  }
  const terms = (ids: number[], lookup: Map<number, AbiTerm>): AbiTerm[] => ids.map(id => {
    const term = lookup.get(id);
    if (!term) throw new Error(`Missing ABI taxonomy id ${id}`);
    return term;
  });
  const date = dates(row.date, row.date_gmt);
  const modified = dates(row.modified, row.modified_gmt);
  const normalized = {
    key: `abi:wp:${row.id}`, sourceId: row.id, edition: 'CURRENT' as const, url, canonicalUrl,
    title, summary: plain(row.excerpt.rendered), contentHtml: row.content.rendered, text,
    contentStatus: text.length >= 20 ? 'TEXT' : images.length || /<(iframe|video|audio)/iu.test(row.content.rendered) ? 'MEDIA_ONLY' : 'EMPTY',
    ...date, modifiedAt: modified.publishedAt, statedDate: row.date, statedDateGmt: row.date_gmt,
    statedModified: row.modified, categories: terms(row.categories, categories), tags: terms(row.tags, tags),
    author: { id: row.author, name: row._embedded?.author?.[0]?.name ?? null },
    images, links: links(row.content.rendered, url), mentions: matchIssuers(title, text, issuers),
    topics: topics(`${title}\n${text}`), quantities: quantities(text),
    dateline: text.match(/^([^\n]{5,180}?\(ABI\)[^\w]*)/u)?.[1]?.trim() ?? null,
    parserVersion: 'abi-v1' as const,
  };
  return abiArticleSchema.parse({ ...normalized, contentSha256: sha(JSON.stringify(normalized)),
    retrievedAt: source.retrievedAt, responseUrl: source.url, responseSha256: source.sha256, responseStorage: source.storage });
}
