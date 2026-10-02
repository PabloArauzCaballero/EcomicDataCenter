import type { BrowserContext } from 'playwright';
import { countBefore, parseCount } from '../parse-count';
import { sha256 } from '../social-browser';
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

export async function readLinkedin(
  context: BrowserContext,
  target: AccountTarget,
): Promise<AccountReading> {
  const page = await context.newPage();
  try {
    const response = await page.goto(target.url, {
      waitUntil: 'domcontentloaded',
      timeout: 45_000,
    });
    await page.waitForTimeout(4_000);
    const html = await page.content();
    const evidence = sha256(html);
    if (page.url().includes('/authwall') || page.url().includes('/login')) {
      return unread(target, 'BLOCKED', 'LinkedIn pidió iniciar sesión', html, evidence);
    }
    if (response?.status() === 404)
      return unread(target, 'NOT_FOUND', 'LinkedIn respondió 404', html, evidence);
    const description = metaContent(html, 'og:description') ?? '';
    const followers = countBefore(description, /(?:seguidores|followers)/);
    if (followers === null)
      return unread(target, 'BLOCKED', 'la página llegó sin seguidores', html, evidence);

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
    };
  } finally {
    await page.close();
  }
}
