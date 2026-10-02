import type { BrowserContext, Page } from 'playwright';
import { parseCount } from '../parse-count';
import { pause, sha256 } from '../social-browser';
import {
  metaContent,
  unread,
  type AccountReading,
  type AccountTarget,
  type CommentText,
  laPazHour,
  type PostReading,
} from '../social-types';

/**
 * YouTube sin sesión: la única red que entrega todo.
 *
 * - **Canal**: `ytInitialData` de la pestaña Videos. La cabecera
 *   (`pageHeaderViewModel`) trae «973 mil suscriptores» y «2.8 K videos»; cada
 *   video es un `lockupViewModel` con título, vistas y antigüedad relativa
 *   («hace 9 días»).
 * - **Videos principales**: de los últimos 30, los de los últimos 90 días con
 *   más vistas. Cada uno se abre: `ytInitialPlayerResponse` da vistas, fecha y
 *   descripción; el botón «Me gusta» su conteo; la cabecera de comentarios el
 *   total; y los comentarios se leen bajando por la página.
 */

const TOP_VIDEOS = 6;
const COMMENTS_PER_VIDEO = 150;
const WINDOW_DAYS = 90;

type Json = Record<string, unknown>;

/**
 * El objeto que la página asigna a `name` («var ytInitialData = {…};»). Se
 * recorre contando llaves fuera de las cadenas porque lo que sigue al cierre
 * cambia de una página a otra (`;</script>`, `;var meta = …`).
 */
export function initialJson(html: string, name: string): Json | null {
  const marker = html.indexOf(`${name} = {`);
  if (marker < 0) return null;
  const start = html.indexOf('{', marker);
  let depth = 0;
  let quoted = false;
  for (let index = start; index < html.length; index += 1) {
    const char = html[index];
    if (quoted) {
      if (char === '\\') index += 1;
      else if (char === '"') quoted = false;
      continue;
    }
    if (char === '"') quoted = true;
    else if (char === '{') depth += 1;
    else if (char === '}') {
      depth -= 1;
      if (depth === 0) {
        try {
          return JSON.parse(html.slice(start, index + 1)) as Json;
        } catch {
          return null;
        }
      }
    }
  }
  return null;
}

function collect(node: unknown, key: string, into: Json[] = []): Json[] {
  if (!node || typeof node !== 'object') return into;
  const record = node as Json;
  if (record[key] && typeof record[key] === 'object') {
    into.push(record[key] as Json);
    return into;
  }
  for (const value of Object.values(record)) collect(value, key, into);
  return into;
}

function texts(node: unknown): Array<{ content: string; label: string }> {
  const parts = collect(node, 'metadataParts').flatMap((value) =>
    Array.isArray(value) ? value : [],
  );
  return parts.map((part: { text?: { content?: string }; accessibilityLabel?: string }) => ({
    content: part.text?.content ?? '',
    label: part.accessibilityLabel ?? part.text?.content ?? '',
  }));
}

/** «hace 9 días» → la fecha aproximada. Los meses y años son aproximados a propósito. */
export function relativeDate(text: string, now = new Date()): string | null {
  const match = /hace\s+(\d+)\s+(segundo|minuto|hora|d[ií]a|semana|mes|año|ano)/iu.exec(text);
  if (!match) return null;
  const amount = Number(match[1]);
  const unit = (match[2] ?? '').toLowerCase();
  const days = unit.startsWith('d')
    ? amount
    : unit.startsWith('semana')
      ? amount * 7
      : unit.startsWith('mes')
        ? amount * 30
        : unit.startsWith('a')
          ? amount * 365
          : 0;
  return new Date(now.getTime() - days * 86_400_000).toISOString().slice(0, 10);
}

export function channelFromHtml(html: string): {
  followers: number | null;
  postCount: number | null;
  videos: Array<{ id: string; title: string; views: number | null; publishedAt: string | null }>;
} {
  const data = initialJson(html, 'ytInitialData');
  const header = collect(data, 'pageHeaderViewModel')[0];
  const headerParts = texts(header);
  const followers = headerParts.find((part) => /suscriptor|subscriber/iu.test(part.label));
  const videoCount = headerParts.find((part) => /video/iu.test(part.content));
  const videos = collect(data, 'lockupViewModel').map((lockup) => {
    const parts = texts(lockup);
    const views = parts.find((part) => /vista|view/iu.test(part.label));
    const age = parts.find((part) => /hace|ago/iu.test(part.label));
    const title = (
      collect(lockup, 'lockupMetadataViewModel')[0]?.title as { content?: string } | undefined
    )?.content;
    return {
      id: typeof lockup.contentId === 'string' ? lockup.contentId : '',
      title: title ?? '',
      views: views ? parseCount(views.label) : null,
      publishedAt: age ? relativeDate(age.label) : null,
    };
  });
  return {
    followers: followers ? parseCount(followers.label) : null,
    postCount: videoCount ? parseCount(videoCount.content) : null,
    videos: videos.filter((video) => video.id),
  };
}

async function readVideo(
  context: BrowserContext,
  target: AccountTarget,
  id: string,
): Promise<{ post: PostReading; comments: CommentText[] } | null> {
  const page: Page = await context.newPage();
  const url = `https://www.youtube.com/watch?v=${id}`;
  try {
    await page.goto(url, { waitUntil: 'domcontentloaded', timeout: 45_000 });
    await page.waitForTimeout(3_000);
    const player = initialJson(await page.content(), 'ytInitialPlayerResponse');
    const details = (player?.videoDetails ?? {}) as Json;
    const micro: Json = collect(player, 'playerMicroformatRenderer')[0] ?? {};
    await page.evaluate(() => window.scrollBy(0, 700));
    await page.waitForTimeout(2_500);
    let comments: string[] = [];
    // Se baja hasta tener 150 o hasta que dos vueltas seguidas no traigan
    // ninguno nuevo: casi todos los videos corporativos tienen pocos, y esperar
    // catorce vueltas por cada uno multiplicaba la corrida por cuatro.
    let still = 0;
    for (let round = 0; round < 16 && comments.length < COMMENTS_PER_VIDEO && still < 2; round += 1) {
      await page.evaluate(() => window.scrollBy(0, 2_000));
      await page.waitForTimeout(1_400);
      const seen = comments.length;
      comments = await page.$$eval('ytd-comment-thread-renderer #content-text', (nodes) =>
        nodes.map((node) => node.textContent?.trim() ?? '').filter(Boolean),
      );
      still = comments.length === seen ? still + 1 : 0;
    }
    const likeLabel = await page
      .$eval(
        'like-button-view-model button',
        (button) =>
          [button.getAttribute('aria-label'), button.textContent].find(
            (text) => text && /\d/u.test(text),
          ) ?? null,
      )
      .catch(() => null);
    const countText = await page
      .$eval('ytd-comments-header-renderer #count', (node) => node.textContent)
      .catch(() => null);
    const post: PostReading = {
      slug: target.slug,
      platform: 'youtube',
      postId: id,
      url,
      publishedAt: typeof micro.publishDate === 'string' ? micro.publishDate.slice(0, 10) : null,
      text: [details.title, details.shortDescription]
        .filter((part): part is string => typeof part === 'string')
        .join('\n')
        .trim(),
      likes: parseCount(likeLabel),
      comments: countText ? parseCount(countText) : null,
      shares: null,
      views: details.viewCount ? Number(details.viewCount) : null,
      discovery: 'PROFILE',
      format: 'VIDEO',
      publishedHour:
        typeof micro.publishDate === 'string' && micro.publishDate.length > 10
          ? laPazHour(Date.parse(micro.publishDate) / 1_000)
          : null,
    };
    const texts = comments
      .slice(0, COMMENTS_PER_VIDEO)
      .map((text) => ({ slug: target.slug, platform: 'youtube' as const, postId: id, text }));
    return { post, comments: texts };
  } catch {
    return null;
  } finally {
    await page.close();
  }
}

export async function readYoutube(
  context: BrowserContext,
  target: AccountTarget,
): Promise<AccountReading> {
  const page = await context.newPage();
  let html: string;
  let status: number | undefined;
  try {
    const response = await page.goto(`${target.url.replace(/\/$/u, '')}/videos`, {
      waitUntil: 'domcontentloaded',
      timeout: 45_000,
    });
    status = response?.status();
    await page.waitForTimeout(3_500);
    html = await page.content();
  } finally {
    await page.close();
  }
  const evidence = sha256(html);
  if (status === 404) return unread(target, 'NOT_FOUND', 'YouTube respondió 404', html, evidence);
  const channel = channelFromHtml(html);
  if (channel.followers === null && channel.videos.length === 0) {
    return unread(target, 'ERROR', 'el canal llegó sin cabecera ni videos', html, evidence);
  }
  const since = new Date(Date.now() - WINDOW_DAYS * 86_400_000).toISOString().slice(0, 10);
  const listed: PostReading[] = channel.videos.map((video) => ({
    slug: target.slug,
    platform: 'youtube',
    postId: video.id,
    url: `https://www.youtube.com/watch?v=${video.id}`,
    publishedAt: video.publishedAt,
    text: video.title,
    likes: null,
    comments: null,
    shares: null,
    views: video.views,
    discovery: 'PROFILE',
    format: 'VIDEO',
    publishedHour: null,
  }));
  const recent = listed.filter((video) => (video.publishedAt ?? '') >= since);
  const top = [...recent]
    .sort((left, right) => (right.views ?? 0) - (left.views ?? 0))
    .slice(0, TOP_VIDEOS);
  const detailed = new Map<string, PostReading>();
  const comments: CommentText[] = [];
  for (const video of top) {
    await pause(1, 2.5);
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
    html,
  };
}
