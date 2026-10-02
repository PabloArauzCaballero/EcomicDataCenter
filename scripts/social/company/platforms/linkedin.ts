import type { BrowserContext } from 'playwright';
import { countBefore, parseCount } from '../parse-count';
import { bingResults } from '../search-account';
import { openContext, pause, sha256 } from '../social-browser';
import {
  metaContent,
  unread,
  type AccountReading,
  type AccountTarget,
  type PostReading,
} from '../social-types';

/**
 * LinkedIn sin sesión: la página pública de la empresa («organization_guest»).
 *
 * - **Perfil**: `og:description` («66.230 seguidores en LinkedIn»).
 * - **Posts**: unas diez tarjetas `main-feed-activity-card` con su texto, su
 *   antigüedad relativa («3 días»), reacciones y comentarios.
 * - **Comentarios**: no se muestran sin sesión.
 *
 * LinkedIn manda al muro de inicio de sesión (`/authwall`) cuando le piden
 * muchas páginas seguidas: eso es `BLOCKED`, y el recolector baja el ritmo.
 */

interface Card {
  urn: string;
  media: string;
  text: string;
  age: string;
  reactions: string;
  comments: string;
}

/** «3 días», «2 semanas», «1 mes», «5 h», «1 año»: la fecha aproximada. */
export function linkedinAge(text: string, now = new Date()): string | null {
  const match = /(\d+)\s*(h|hora|d|día|dia|sem|semana|mes|a|año)/iu.exec(text);
  if (!match) return null;
  const amount = Number(match[1]);
  const unit = (match[2] ?? '').toLowerCase();
  const days =
    unit === 'h' || unit.startsWith('hora')
      ? 0
      : unit.startsWith('d')
        ? amount
        : unit.startsWith('sem')
          ? amount * 7
          : unit.startsWith('mes')
            ? amount * 30
            : amount * 365;
  return new Date(now.getTime() - days * 86_400_000).toISOString().slice(0, 10);
}

const WALL = /\/authwall|\/login|\/uas\/|\/checkpoint\//u;

/**
 * Direcciones que se prueban para una misma empresa: la que dice el directorio, el mismo
 * nombre en el subdominio de Bolivia (otro borde de LinkedIn, que a veces no pide sesión) y
 * los otros tipos de página (`company`, `school`, `showcase`), por si la empresa cambió de tipo.
 */
export function linkedinVariants(url: string): string[] {
  const match = /^https?:\/\/[^/]+\/(company|school|showcase)\/([^/?#]+)/iu.exec(url);
  if (!match) return [url];
  const kind = (match[1] ?? 'company').toLowerCase();
  const slug = match[2] ?? '';
  const others = ['company', 'school', 'showcase'].filter((other) => other !== kind);
  return [
    `https://www.linkedin.com/${kind}/${slug}/`,
    `https://bo.linkedin.com/${kind}/${slug}`,
    ...others.slice(0, 2).map((other) => `https://www.linkedin.com/${other}/${slug}/`),
  ];
}

type Attempt =
  | { kind: 'READ'; reading: AccountReading }
  | { kind: 'WALL'; html: string; evidence: string }
  | { kind: 'MISSING'; html: string; evidence: string };

async function readPage(
  context: BrowserContext,
  target: AccountTarget,
  url: string,
): Promise<Attempt> {
  const page = await context.newPage();
  try {
    const response = await page.goto(url, { waitUntil: 'domcontentloaded', timeout: 45_000 });
    await page.waitForTimeout(4_000);
    const html = await page.content();
    const evidence = sha256(html);
    if (WALL.test(page.url())) return { kind: 'WALL', html, evidence };
    if (response?.status() === 404) return { kind: 'MISSING', html, evidence };
    const description = metaContent(html, 'og:description') ?? '';
    const followers = countBefore(description, /(?:seguidores|followers)/);
    if (followers === null) return { kind: 'WALL', html, evidence };

    // Sin funciones con nombre dentro del callback: tsx les agrega `__name`,
    // que no existe en la página.
    const cards: Card[] = await page.$$eval('article.main-feed-activity-card', (articles) =>
      articles.map((article) => {
        const [text, time, lockup, reactions, comments] = [
          '[data-test-id="main-feed-activity-card__commentary"]',
          'time',
          '[data-test-id="main-feed-activity-card__entity-lockup"]',
          '[data-test-id="social-actions__reaction-count"]',
          '[data-test-id="social-actions__comments"]',
        ].map((selector) => article.querySelector(selector)?.textContent?.trim() ?? '');
        const media = article.querySelector('[data-test-id="feed-native-video-content"]')
          ? 'VIDEO'
          : article.querySelector('[data-test-id="feed-images-content"]')
            ? 'PHOTO'
            : 'TEXT';
        return {
          media,
          urn: article.getAttribute('data-activity-urn') ?? '',
          text: text ?? '',
          age: time || lockup || '',
          reactions: reactions ?? '',
          comments: comments ?? '',
        };
      }),
    );
    const posts: PostReading[] = cards
      .filter((card) => card.urn)
      .map((card) => ({
        slug: target.slug,
        platform: 'linkedin',
        postId: card.urn.replace('urn:li:activity:', ''),
        url: `https://www.linkedin.com/feed/update/${card.urn}/`,
        publishedAt: linkedinAge(card.age),
        text: card.text,
        likes: parseCount(card.reactions),
        comments: parseCount(card.comments),
        shares: null,
        views: null,
        discovery: 'PROFILE',
        format: card.media === 'VIDEO' ? 'VIDEO' : card.media === 'PHOTO' ? 'PHOTO' : 'TEXT',
        publishedHour: null,
      }));
    return {
      kind: 'READ',
      reading: {
        profile: {
          ...target,
          status: 'OK',
          retrievedAt: new Date().toISOString(),
          sha256: evidence,
          displayName: metaContent(html, 'og:title')?.replace(/\s*\|\s*LinkedIn\s*$/u, '') ?? null,
          followers,
          following: null,
          postCount: null,
          likesTotal: null,
          talkingAbout: null,
        },
        posts,
        comments: [],
        html,
      },
    };
  } finally {
    await page.close();
  }
}

/**
 * Último recurso con el muro puesto: el extracto que Bing guarda de la página de la empresa
 * («Entel | 66.230 seguidores en LinkedIn…») trae los seguidores sin visitar LinkedIn. Es una cifra
 * del buscador, no de la página, y por eso lleva su nota; no trae posts.
 */
async function followersFromSearch(
  context: BrowserContext,
  target: AccountTarget,
): Promise<number | null> {
  const slug = /\/(?:company|school|showcase)\/([^/?#]+)/iu.exec(target.url)?.[1];
  if (!slug) return null;
  const results = await bingResults(context, `${decodeURIComponent(slug)} LinkedIn seguidores`);
  for (const result of results) {
    if (!result.url.toLowerCase().includes(`/${slug.toLowerCase()}`)) continue;
    const followers = countBefore(result.snippet ?? '', /(?:seguidores|followers)/);
    if (followers !== null) return followers;
  }
  return null;
}

export async function readLinkedin(
  context: BrowserContext,
  target: AccountTarget,
): Promise<AccountReading> {
  let last: { html: string; evidence: string } | null = null;
  let walled = false;
  const browser = context.browser();
  for (const [index, url] of linkedinVariants(target.url).entries()) {
    // Cada variante en un contexto limpio: el muro se apoya en las cookies de la visita anterior.
    const fresh = index > 0 && browser?.isConnected() ? await openContext(browser) : null;
    try {
      const attempt = await readPage(fresh ?? context, target, url);
      if (attempt.kind === 'READ') return attempt.reading;
      last = attempt;
      walled ||= attempt.kind === 'WALL';
      // Un muro cede a veces con otra dirección; un 404 pide probar el otro tipo de página.
      await pause(5, 9);
    } finally {
      await fresh?.close().catch(() => undefined);
    }
  }
  const html = last?.html ?? null;
  const evidence = last?.evidence ?? null;
  if (!walled) {
    return unread(
      target,
      'NOT_FOUND',
      'LinkedIn respondió 404 en todas las variantes',
      html,
      evidence,
    );
  }
  const followers = await followersFromSearch(context, target);
  if (followers !== null) {
    return {
      profile: {
        ...target,
        status: 'OK',
        statusNote: 'seguidores del extracto de Bing; LinkedIn pidió sesión y no se leyeron posts',
        retrievedAt: new Date().toISOString(),
        sha256: evidence,
        displayName: null,
        followers,
        following: null,
        postCount: null,
        likesTotal: null,
        talkingAbout: null,
      },
      posts: [],
      comments: [],
      html,
    };
  }
  return unread(
    target,
    'BLOCKED',
    'LinkedIn pidió iniciar sesión en todas las variantes',
    html,
    evidence,
  );
}
