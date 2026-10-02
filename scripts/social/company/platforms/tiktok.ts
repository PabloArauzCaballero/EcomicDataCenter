import type { BrowserContext } from 'playwright';
import { countBefore } from '../parse-count';
import { bingResults } from '../search-account';
import { pause, sha256 } from '../social-browser';
import {
  metaContent,
  unread,
  type AccountReading,
  type AccountTarget,
  laPazHour,
  type PostReading,
} from '../social-types';

/**
 * TikTok sin sesión.
 *
 * - **Perfil**: el JSON `__UNIVERSAL_DATA_FOR_REHYDRATION__` que viene en el
 *   HTML trae `followerCount`, `heartCount` y `videoCount`. Si falta, la
 *   `og:description` («61.6K me gusta.21K seguidores…») da dos de las tres.
 * - **Videos**: la grilla del perfil se carga por `api/post/item_list`, que sin
 *   sesión vuelve vacía y termina en un captcha de rompecabezas. El captcha NO
 *   se resuelve. Los videos se buscan en Bing («@cuenta tiktok») y cada uno se
 *   abre suelto: la página de un video sí trae sus cifras en el mismo JSON.
 *   Por eso son «videos que el buscador conoce», no los últimos, y se marcan
 *   `discovery: 'SEARCH'`.
 * - **Comentarios**: sin sesión no llegan.
 */

const VIDEOS_PER_ACCOUNT = 10;

type Json = Record<string, unknown>;

export function rehydration(html: string): Json | null {
  const raw = /<script[^>]+id="__UNIVERSAL_DATA_FOR_REHYDRATION__"[^>]*>([\s\S]*?)<\/script>/u.exec(
    html,
  )?.[1];
  if (!raw) return null;
  try {
    const parsed = JSON.parse(raw) as { __DEFAULT_SCOPE__?: Json };
    return parsed.__DEFAULT_SCOPE__ ?? null;
  } catch {
    return null;
  }
}

function numberOf(value: unknown): number | null {
  const parsed = typeof value === 'string' ? Number(value) : value;
  return typeof parsed === 'number' && Number.isFinite(parsed) ? parsed : null;
}

export function profileFromHtml(html: string): {
  statusCode: number | null;
  displayName: string | null;
  followers: number | null;
  following: number | null;
  postCount: number | null;
  likesTotal: number | null;
} {
  const detail = rehydration(html)?.['webapp.user-detail'] as Json | undefined;
  const info = detail?.userInfo as { user?: Json; stats?: Json; statsV2?: Json } | undefined;
  const stats = info?.statsV2 ?? info?.stats;
  if (stats) {
    return {
      statusCode: numberOf(detail?.statusCode),
      displayName: typeof info?.user?.nickname === 'string' ? info.user.nickname : null,
      followers: numberOf(stats.followerCount),
      following: numberOf(stats.followingCount),
      postCount: numberOf(stats.videoCount),
      likesTotal: numberOf(stats.heartCount ?? stats.heart),
    };
  }
  const description = metaContent(html, 'og:description') ?? '';
  return {
    statusCode: numberOf(detail?.statusCode),
    displayName: null,
    followers: countBefore(description, /(?:seguidores|followers)/),
    following: null,
    postCount: null,
    likesTotal: countBefore(description, /(?:me gusta|likes)/),
  };
}

export function videoFromHtml(
  html: string,
): Omit<PostReading, 'slug' | 'platform' | 'url' | 'discovery'> | null {
  const detail = rehydration(html)?.['webapp.video-detail'] as Json | undefined;
  const item = (detail?.itemInfo as { itemStruct?: Json } | undefined)?.itemStruct;
  if (!item || typeof item.id !== 'string') return null;
  const stats = (item.statsV2 ?? item.stats ?? {}) as Json;
  const created = numberOf(item.createTime);
  return {
    postId: item.id,
    publishedAt: created ? new Date(created * 1_000).toISOString().slice(0, 10) : null,
    text: typeof item.desc === 'string' ? item.desc : '',
    likes: numberOf(stats.diggCount),
    comments: numberOf(stats.commentCount),
    shares: numberOf(stats.shareCount),
    views: numberOf(stats.playCount),
    format: 'VIDEO',
    publishedHour: laPazHour(created),
  };
}

async function videoLinks(context: BrowserContext, handle: string): Promise<string[]> {
  const results = await bingResults(context, `"@${handle}" tiktok video`);
  const own = new RegExp(`tiktok\\.com/@${handle.replace(/[.]/gu, '\\.')}/video/(\\d+)`, 'iu');
  const ids = results
    .map((result) => own.exec(result.url)?.[1])
    .filter((id): id is string => Boolean(id));
  return [...new Set(ids)].map((id) => `https://www.tiktok.com/@${handle}/video/${id}`);
}

async function readVideo(
  context: BrowserContext,
  target: AccountTarget,
  url: string,
): Promise<PostReading | null> {
  const page = await context.newPage();
  try {
    await page.goto(url, { waitUntil: 'domcontentloaded', timeout: 40_000 });
    await page.waitForTimeout(3_000);
    const video = videoFromHtml(await page.content());
    return video
      ? { ...video, slug: target.slug, platform: 'tiktok', url, discovery: 'SEARCH' }
      : null;
  } catch {
    return null;
  } finally {
    await page.close();
  }
}

export async function readTiktok(
  context: BrowserContext,
  target: AccountTarget,
): Promise<AccountReading> {
  const page = await context.newPage();
  let html: string;
  try {
    await page.goto(target.url, { waitUntil: 'domcontentloaded', timeout: 45_000 });
    await page.waitForTimeout(5_000);
    html = await page.content();
  } finally {
    await page.close();
  }
  const evidence = sha256(html);
  const profile = profileFromHtml(html);
  if (profile.statusCode === 10202 || profile.statusCode === 10221) {
    return unread(target, 'NOT_FOUND', `TikTok statusCode ${profile.statusCode}`, html, evidence);
  }
  if (profile.followers === null)
    return unread(target, 'BLOCKED', 'el perfil llegó sin cifras', html, evidence);

  const posts: PostReading[] = [];
  for (const url of (await videoLinks(context, target.handle)).slice(0, VIDEOS_PER_ACCOUNT)) {
    await pause(2, 5);
    const video = await readVideo(context, target, url);
    if (video) posts.push(video);
  }
  return {
    profile: {
      ...target,
      status: 'OK',
      retrievedAt: new Date().toISOString(),
      sha256: evidence,
      displayName: profile.displayName,
      followers: profile.followers,
      following: profile.following,
      postCount: profile.postCount,
      likesTotal: profile.likesTotal,
      talkingAbout: null,
    },
    posts,
    comments: [],
    html,
  };
}
