import type { BrowserContext } from 'playwright';
import { countBefore } from '../parse-count';
import { pause, sha256 } from '../social-browser';
import {
  metaContent,
  unread,
  type AccountReading,
  type AccountTarget,
  type PostReading,
} from '../social-types';

/**
 * Instagram sin sesión.
 *
 * - **Perfil**: la etiqueta `og:description` («18K seguidores, 58 seguidos,
 *   4,301 publicaciones - …») trae las tres cifras. La API interna
 *   `web_profile_info` responde 429 sin sesión y no se usa.
 * - **Posts**: la grilla del perfil enlaza los últimos 12. Cada post abierto
 *   trae en su `og:description` likes, comentarios, autor, fecha y texto
 *   («711 likes, 19 comments - autor el September 30, 2026: "…"»).
 * - **Comentarios**: sin sesión no se muestran. No se intenta otra vía.
 *
 * Los perfiles de bebidas alcohólicas exigen mayoría de edad («Perfil
 * restringido») y vuelven como `RESTRICTED`.
 */

const POSTS_PER_ACCOUNT = 12;

export function profileFigures(description: string): {
  followers: number | null;
  following: number | null;
  postCount: number | null;
} {
  return {
    followers: countBefore(description, /(?:seguidores|followers)/),
    following: countBefore(description, /(?:seguidos|following)/),
    postCount: countBefore(description, /(?:publicaciones|posts)/),
  };
}

export function postFigures(description: string): {
  likes: number | null;
  comments: number | null;
  publishedAt: string | null;
  text: string;
} {
  const date = /\s(?:el|on)\s+([A-Za-z]+ \d{1,2}, \d{4})\s*:/u.exec(description)?.[1];
  const parsed = date ? new Date(`${date} 12:00:00 UTC`) : null;
  const caption = /:\s*"([\s\S]*)"\.?\s*$/u.exec(description)?.[1] ?? '';
  return {
    likes: countBefore(description, /(?:likes?|me gusta)/),
    comments: countBefore(description, /(?:comments?|comentarios?)/),
    publishedAt:
      parsed && !Number.isNaN(parsed.getTime()) ? parsed.toISOString().slice(0, 10) : null,
    text: caption.trim(),
  };
}

export function shortcodeOf(url: string): string | null {
  return /\/(?:p|reel|tv)\/([A-Za-z0-9_-]+)/u.exec(url)?.[1] ?? null;
}

export async function readPost(
  context: BrowserContext,
  target: AccountTarget,
  url: string,
): Promise<PostReading | null> {
  const postId = shortcodeOf(url);
  if (!postId) return null;
  const page = await context.newPage();
  try {
    await page.goto(url, { waitUntil: 'domcontentloaded', timeout: 40_000 });
    await page.waitForTimeout(2_500);
    const description = metaContent(await page.content(), 'og:description');
    if (!description) return null;
    return {
      slug: target.slug,
      platform: 'instagram',
      postId,
      url: `https://www.instagram.com/p/${postId}/`,
      ...postFigures(description),
      shares: null,
      views: null,
      discovery: 'PROFILE',
      format: /\/reel\//u.test(url) ? 'REEL' : 'POST',
      publishedHour: null,
    };
  } catch {
    return null;
  } finally {
    await page.close();
  }
}

export async function readInstagram(
  context: BrowserContext,
  target: AccountTarget,
): Promise<AccountReading> {
  const page = await context.newPage();
  try {
    const response = await page.goto(target.url, {
      waitUntil: 'domcontentloaded',
      timeout: 45_000,
    });
    await page.waitForTimeout(5_000);
    const html = await page.content();
    const evidence = sha256(html);
    if (
      response?.status() === 404 ||
      /Esta página no está disponible|Sorry, this page isn't available/u.test(html)
    ) {
      return unread(target, 'NOT_FOUND', 'Instagram dice que la página no existe', html, evidence);
    }
    if (/Perfil restringido|Restricted profile/u.test(html)) {
      return unread(target, 'RESTRICTED', 'perfil con restricción de edad', html, evidence);
    }
    if (response?.status() === 429)
      return unread(target, 'BLOCKED', 'Instagram respondió 429', html, evidence);
    const description = metaContent(html, 'og:description');
    if (!description)
      return unread(target, 'BLOCKED', 'el perfil llegó sin og:description', html, evidence);

    const figures = profileFigures(description);
    const title = metaContent(html, 'og:title');
    const links = await page.$$eval('a[href*="/p/"], a[href*="/reel/"]', (anchors) => [
      ...new Set(anchors.map((anchor) => (anchor as HTMLAnchorElement).href)),
    ]);
    // De a dos posts a la vez: doce posts de a uno eran casi un minuto y medio por
    // cuenta, y con más de dos pestañas la laptop se queda sin memoria.
    const posts: PostReading[] = [];
    const chosen = links.slice(0, POSTS_PER_ACCOUNT);
    for (let start = 0; start < chosen.length; start += 2) {
      await pause(1.5, 3);
      const pair = await Promise.all(
        chosen.slice(start, start + 2).map((link) => readPost(context, target, link)),
      );
      for (const post of pair) if (post) posts.push(post);
    }
    return {
      profile: {
        ...target,
        status: 'OK',
        retrievedAt: new Date().toISOString(),
        sha256: evidence,
        displayName: title?.replace(/\s*\(@[^)]*\).*$/u, '').trim() || null,
        ...figures,
        likesTotal: null,
        talkingAbout: null,
      },
      posts,
      comments: [],
      html,
    };
  } finally {
    await page.close();
  }
}
