import type { BrowserContext } from 'playwright';
import { parseCount } from '../parse-count';
import { sha256 } from '../social-browser';
import {
  metaContent,
  unread,
  type AccountReading,
  type AccountTarget,
  type CommentText,
  type PostReading,
} from '../social-types';
import { graphqlBlobs, jsonBlobs, pageFigures, postsFromBlobs } from './facebook';
import { channelFromHtml, readVideo, relativeDate } from './youtube';

/**
 * Segunda pasada de profundidad (ADR 0027): vuelve sobre una cuenta ya leída y baja más.
 * Escribe en su propia corrida (`<corrida>-deep`); el análisis une las dos lecturas y
 * conserva lo mejor de cada una, de modo que una lectura profunda fallida nunca borra la primera.
 */

export interface DeepOptions {
  /** Videos de YouTube que se abren para leer sus cifras y comentarios. */
  readonly details: number;
  /** Videos que se listan del canal, como máximo. */
  readonly listLimit: number;
  /** Veces que se baja la página de Facebook, como máximo. */
  readonly facebookRounds: number;
  /** Publicaciones de TikTok o Instagram que se buscan en Bing y se abren sueltas, como máximo. */
  readonly searchPosts: number;
}

interface Listed {
  readonly id: string;
  readonly text: string;
}

const DURATION = /^\d{1,2}:\d{2}(?::\d{2})?$/u;

const SHORT_COUNT = /^\d[\d.,\s]*(?:\s*(?:K|M|B|mil|mill\.?|millones))?$/iu;

/**
 * «hace 3 a», «hace 2 m», «hace 5 d»: el texto corto con que YouTube pinta la tarjeta. La forma larga
 * («hace 3 años») la resuelve `relativeDate`; las unidades son aproximadas a propósito.
 */
export function shortAge(text: string, now = new Date()): string | null {
  const match = /hace\s+(\d+)\s*([a-záéíóú]+)/iu.exec(text);
  if (!match) return null;
  const amount = Number(match[1]);
  const unit = (match[2] ?? '').toLowerCase();
  const days = /^(?:s|seg|segundos?|min|minutos?|h|horas?)$/u.test(unit)
    ? 0
    : /^(?:d|días?|dias?)$/u.test(unit)
      ? amount
      : /^(?:sem|semanas?)$/u.test(unit)
        ? amount * 7
        : /^(?:m|mes|meses)$/u.test(unit)
          ? amount * 30
          : /^(?:a|año|años|ano|anos)$/u.test(unit)
            ? amount * 365
            : null;
  return days === null
    ? null
    : new Date(now.getTime() - days * 86_400_000).toISOString().slice(0, 10);
}

/**
 * Una tarjeta de video del DOM ya partida en campos. Llega abreviada
 * («3:07 / título / 6.2 K / hace 3 a») o completa («1,2 mil vistas • hace 3 meses»).
 */
export function parseCard(text: string): {
  title: string;
  views: number | null;
  publishedAt: string | null;
} {
  const parts = text
    .split('\n')
    .flatMap((line) => line.split(/[•·]/u))
    .map((part) => part.trim())
    .filter(Boolean);
  const agePart = parts.find((part) => /^(?:hace|ago)\b/iu.test(part));
  const viewsPart = parts.find(
    (part) => /\b(?:vistas?|views?|visualizaciones)\b/iu.test(part) || SHORT_COUNT.test(part),
  );
  const title = parts.find(
    (part) => part !== viewsPart && part !== agePart && !DURATION.test(part),
  );
  return {
    title: title ?? '',
    views: viewsPart ? parseCount(viewsPart) : null,
    publishedAt: agePart ? (relativeDate(agePart) ?? shortAge(agePart)) : null,
  };
}

async function listChannel(
  context: BrowserContext,
  target: AccountTarget,
  limit: number,
): Promise<{ html: string; status: number | undefined; videos: Listed[] }> {
  const page = await context.newPage();
  try {
    const response = await page.goto(`${target.url.replace(/\/$/u, '')}/videos`, {
      waitUntil: 'domcontentloaded',
      timeout: 45_000,
    });
    await page.waitForTimeout(3_500);
    const html = await page.content();
    const count = (): Promise<number> =>
      page.evaluate(
        () =>
          new Set(
            [...document.querySelectorAll('a[href*="/watch?v="]')].map((anchor) =>
              new URL((anchor as HTMLAnchorElement).href).searchParams.get('v'),
            ),
          ).size,
      );
    let seen = await count();
    let still = 0;
    for (let round = 0; round < 24 && seen < limit && still < 2; round += 1) {
      await page.evaluate(() => window.scrollTo(0, document.documentElement.scrollHeight));
      await page.waitForTimeout(1_600);
      const now = await count();
      still = now === seen ? still + 1 : 0;
      seen = now;
    }
    const videos = await page.evaluate(() => {
      const byId = new Map<string, string>();
      for (const anchor of document.querySelectorAll('a[href*="/watch?v="]')) {
        const id = new URL((anchor as HTMLAnchorElement).href).searchParams.get('v');
        if (!id) continue;
        const card = anchor.closest(
          'yt-lockup-view-model, ytd-rich-item-renderer, ytd-grid-video-renderer, ytd-video-renderer',
        );
        const text = (card as HTMLElement | null)?.innerText ?? '';
        if (text.length > (byId.get(id)?.length ?? 0)) byId.set(id, text);
      }
      return [...byId].map(([id, text]) => ({ id, text }));
    });
    return { html, status: response?.status(), videos };
  } finally {
    await page.close();
  }
}

export async function readYoutubeDeep(
  context: BrowserContext,
  target: AccountTarget,
  options: DeepOptions,
  alreadyDetailed: ReadonlySet<string>,
): Promise<AccountReading> {
  const { html, status, videos } = await listChannel(context, target, options.listLimit);
  const evidence = sha256(html);
  if (status === 404) return unread(target, 'NOT_FOUND', 'YouTube respondió 404', null, evidence);
  const channel = channelFromHtml(html);
  if (channel.followers === null && videos.length === 0) {
    return unread(target, 'ERROR', 'el canal llegó sin cabecera ni videos', null, evidence);
  }
  const listed: PostReading[] = videos.map((video) => {
    const card = parseCard(video.text);
    return {
      slug: target.slug,
      platform: 'youtube',
      postId: video.id,
      url: `https://www.youtube.com/watch?v=${video.id}`,
      publishedAt: card.publishedAt,
      text: card.title,
      likes: null,
      comments: null,
      shares: null,
      views: card.views,
      discovery: 'PROFILE',
      format: 'VIDEO',
      publishedHour: null,
    };
  });
  // Los más vistos de toda la lista y los más nuevos: lo que el canal más mueve y lo que publica hoy.
  const byViews = [...listed].sort((a, b) => (b.views ?? 0) - (a.views ?? 0));
  const newest = [...listed].sort((a, b) =>
    (b.publishedAt ?? '').localeCompare(a.publishedAt ?? ''),
  );
  const picks = new Map<string, PostReading>();
  for (const video of [...byViews.slice(0, options.details), ...newest.slice(0, 2)]) {
    if (picks.size >= options.details) break;
    if (!alreadyDetailed.has(video.postId)) picks.set(video.postId, video);
  }
  const detailed = new Map<string, PostReading>();
  const comments: CommentText[] = [];
  for (const video of picks.values()) {
    const read = await readVideo(context, target, video.postId);
    if (!read) continue;
    detailed.set(video.postId, read.post);
    comments.push(...read.comments);
  }
  return {
    profile: {
      ...target,
      status: 'OK',
      retrievedAt: new Date().toISOString(),
      sha256: evidence,
      displayName: metaContent(html, 'og:title'),
      followers: channel.followers,
      following: null,
      postCount: channel.postCount,
      likesTotal: null,
      talkingAbout: null,
    },
    posts: listed.map((video) => {
      const detail = detailed.get(video.postId);
      return detail
        ? {
            ...detail,
            views: detail.views ?? video.views,
            publishedAt: detail.publishedAt ?? video.publishedAt,
          }
        : video;
    }),
    comments,
    html: null,
  };
}

export async function readFacebookDeep(
  context: BrowserContext,
  target: AccountTarget,
  options: DeepOptions,
): Promise<AccountReading> {
  const page = await context.newPage();
  const extra: unknown[] = [];
  page.on('response', async (response) => {
    if (!response.url().includes('/api/graphql')) return;
    extra.push(...graphqlBlobs(await response.text().catch(() => '')));
  });
  let html: string;
  try {
    await page.goto(target.url, { waitUntil: 'domcontentloaded', timeout: 45_000 });
    await page.waitForTimeout(5_000);
    await page.keyboard.press('Escape').catch(() => undefined);
    let still = 0;
    for (let round = 0; round < options.facebookRounds && still < 4; round += 1) {
      const before = extra.length;
      await page.mouse.wheel(0, 3_000);
      await page.waitForTimeout(2_200);
      still = extra.length === before ? still + 1 : 0;
    }
    html = await page.content();
  } finally {
    await page.close();
  }
  const evidence = sha256(html);
  const description = metaContent(html, 'description') ?? metaContent(html, 'og:description');
  if (!description)
    return unread(target, 'BLOCKED', 'la página llegó sin descripción', null, evidence);
  const figures = pageFigures(description);
  const { posts, comments } = postsFromBlobs([...jsonBlobs(html), ...extra], target.slug);
  return {
    profile: {
      ...target,
      status: figures.followers === null ? 'ERROR' : 'OK',
      ...(figures.followers === null ? { statusNote: 'la descripción no trae seguidores' } : {}),
      retrievedAt: new Date().toISOString(),
      sha256: evidence,
      displayName: metaContent(html, 'og:title'),
      followers: figures.followers,
      following: null,
      postCount: null,
      likesTotal: figures.likesTotal,
      talkingAbout: figures.talkingAbout,
    },
    posts,
    comments,
    html: null,
  };
}
