import { z } from 'zod';

const hash = z.string().regex(/^[a-f0-9]{64}$/u);
const instant = z.iso.datetime({ offset: true });
const term = z.object({ id: z.number().int(), name: z.string(), slug: z.string() }).strict();
const mention = z
  .object({
    filerCode: z.string().min(1),
    filer: z.string().min(1),
    alias: z.string().min(1),
    field: z.enum(['TITLE', 'BODY']),
    role: z.enum(['HEADLINE', 'MENTION']),
    evidence: z.string().min(1),
    start: z.number().int().nonnegative(),
    end: z.number().int().positive(),
    method: z.literal('EXACT_ALIAS_V1'),
  })
  .strict();

export const abiArticleSchema = z
  .object({
    key: z.string().regex(/^abi:(wp|legacy):\d+$/u),
    sourceId: z.number().int().positive(),
    edition: z.enum(['CURRENT', 'HISTORICAL']),
    url: z.url(),
    canonicalUrl: z.url(),
    title: z.string().min(5),
    summary: z.string(),
    contentHtml: z.string(),
    text: z.string(),
    contentStatus: z.enum(['TEXT', 'MEDIA_ONLY', 'EMPTY']),
    publishedAt: instant.nullable(),
    publicationDay: z.string().regex(/^\d{4}-\d{2}-\d{2}$/u),
    modifiedAt: instant.nullable(),
    statedDate: z.string(),
    statedDateGmt: z.string().nullable(),
    statedModified: z.string().nullable(),
    dateQuality: z.enum(['CONSISTENT', 'DAY_ONLY', 'CONFLICT']),
    categories: z.array(term),
    tags: z.array(term),
    author: z.object({ id: z.number().int().nullable(), name: z.string().nullable() }).strict(),
    images: z.array(z.object({ url: z.url(), alt: z.string(), caption: z.string() }).strict()),
    links: z.array(
      z.object({ url: z.url(), text: z.string(), kind: z.enum(['DOCUMENT', 'WEB']) }).strict(),
    ),
    mentions: z.array(mention),
    topics: z.array(z.string()),
    quantities: z.array(
      z.object({ text: z.string(), context: z.string(), start: z.number().int() }).strict(),
    ),
    dateline: z.string().nullable(),
    retrievedAt: instant,
    responseUrl: z.url(),
    responseSha256: hash,
    contentSha256: hash,
    responseStorage: z.string().regex(/^evidence\/[a-f0-9]{64}\.gz$/u),
    parserVersion: z.literal('abi-v1'),
  })
  .strict();

export const abiNewsShardSchema = z
  .object({
    schemaVersion: z.literal('1.0'),
    articles: z.array(abiArticleSchema).max(3000),
  })
  .strict();
export type AbiArticle = z.infer<typeof abiArticleSchema>;
export type AbiMention = AbiArticle['mentions'][number];
export type AbiTerm = z.infer<typeof term>;
