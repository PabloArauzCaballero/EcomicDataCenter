import { z } from 'zod';

/**
 * Las cuentas oficiales de las empresas del ranking Merco en cinco redes, una
 * corrida a la vez (ADR 0027).
 *
 * Tres partes, todas agregadas:
 *
 * - `profiles`: una fila por empresa y red, con lo que la red declaró ese día y
 *   cómo salió la lectura. `status` distinto de `OK` deja las cifras en nulo:
 *   una cuenta que no se dejó leer no es una cuenta sin seguidores.
 * - `posts`: los posts leídos, con su texto —es de la empresa— y el sentimiento
 *   agregado de sus comentarios. Nunca el comentario.
 * - `terms`: lo más repetido en lo que la empresa publica (`COMPANY`) y en lo
 *   que le comentan (`AUDIENCE`).
 */

export const SOCIAL_PLATFORMS = ['facebook', 'instagram', 'tiktok', 'youtube', 'linkedin'] as const;
export const SOCIAL_READ_STATUSES = ['OK', 'RESTRICTED', 'BLOCKED', 'NOT_FOUND', 'ERROR'] as const;
export const SOCIAL_TERM_SCOPES = ['COMPANY', 'AUDIENCE'] as const;
export const SOCIAL_TERM_KINDS = ['WORD', 'BIGRAM', 'HASHTAG', 'EMOJI'] as const;
export const SOCIAL_POLARITIES = ['POS', 'NEG', 'NEU'] as const;
export const SOCIAL_EMOTIONS = ['joy', 'sadness', 'anger', 'surprise', 'disgust', 'fear'] as const;
export const SOCIAL_POST_FORMATS = ['POST', 'REEL', 'VIDEO', 'PHOTO', 'TEXT'] as const;

const slug = z.string().regex(/^[A-Z0-9_]{2,60}$/u);
const day = z.string().regex(/^20\d{2}-(?:0[1-9]|1[0-2])-(?:0[1-9]|[12]\d|3[01])$/u);
const count = z.number().int().nonnegative().nullable();
const percent = z.number().min(-100).max(100);

export const commentSentimentSchema = z
  .object({
    analyzed: z.number().int().positive(),
    positivePct: percent,
    negativePct: percent,
    neutralPct: percent,
    ironyPct: percent.nullable(),
    netScore: percent,
    topEmotion: z.string().max(20).nullable(),
    emotionPct: z.record(z.enum(SOCIAL_EMOTIONS), percent).nullable(),
  })
  .strict();

const profile = z
  .object({
    slug,
    platform: z.enum(SOCIAL_PLATFORMS),
    url: z.url(),
    handle: z.string().min(1).max(120),
    status: z.enum(SOCIAL_READ_STATUSES),
    statusNote: z.string().max(240).nullable(),
    retrievedAt: z.iso.datetime({ offset: false }),
    sha256: z
      .string()
      .regex(/^[a-f0-9]{64}$/u)
      .nullable(),
    displayName: z.string().max(240).nullable(),
    followers: count,
    following: count,
    postCount: count,
    likesTotal: count,
    talkingAbout: count,
    postsRead: z.number().int().nonnegative(),
    postsInWindow: z.number().int().nonnegative(),
    postsPerWeek: z.number().nonnegative().nullable(),
    engagementPct: z.number().nonnegative().nullable(),
    commentsRead: z.number().int().nonnegative(),
    commentSentiment: commentSentimentSchema.nullable(),
  })
  .strict();

const post = z
  .object({
    slug,
    platform: z.enum(SOCIAL_PLATFORMS),
    postId: z.string().min(1).max(80),
    url: z.url(),
    publishedAt: day.nullable(),
    likes: count,
    comments: count,
    shares: count,
    views: count,
    discovery: z.enum(['PROFILE', 'SEARCH']),
    format: z.enum(SOCIAL_POST_FORMATS).nullable(),
    publishedHour: z.number().int().min(0).max(23).nullable(),
    text: z.string().max(600),
    interactions: count,
    captionPolarity: z.enum(SOCIAL_POLARITIES).nullable(),
    commentSentiment: commentSentimentSchema.nullable(),
  })
  .strict();

const term = z
  .object({
    slug,
    scope: z.enum(SOCIAL_TERM_SCOPES),
    texts: z.number().int().nonnegative(),
    kind: z.enum(SOCIAL_TERM_KINDS),
    term: z.string().min(1).max(80),
    count: z.number().int().positive(),
    rank: z.number().int().positive(),
  })
  .strict();

export const companySocialSchema = z
  .object({
    provenance: z
      .object({
        runId: z.string().regex(/^[\w-]{1,40}$/u),
        retrievedAt: z.iso.datetime({ offset: false }),
        collector: z.string().min(1),
        method: z.string().min(1),
        sentimentModel: z.string().nullable(),
        windowDays: z.number().int().positive(),
      })
      .strict(),
    profiles: z.array(profile),
    posts: z.array(post),
    terms: z.array(term),
  })
  .strict();

export type CompanySocial = z.infer<typeof companySocialSchema>;
export type CompanySocialProfile = CompanySocial['profiles'][number];
export type CompanySocialPost = CompanySocial['posts'][number];
export type CompanySocialTerm = CompanySocial['terms'][number];
