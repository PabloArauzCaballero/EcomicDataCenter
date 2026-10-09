import type { BrowserContext } from 'playwright';
import { countBefore } from '../parse-count';
import { sha256 } from '../social-browser';
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
 * Facebook sin sesión.
 *
 * La página pública se pinta detrás de un aviso de «Iniciar sesión» que se
 * cierra; no es un muro. Lo que llega:
 *
 * - **Perfil**: la `meta description` («974.179 seguidores · 17.980 personas
 *   están hablando de esto · …»).
 * - **Posts**: los primeros, embebidos como JSON en el HTML (`post_id`,
 *   `creation_time`, `message.text`, `reaction_count`, `comments.total_count`,
 *   `share_count`), más los que llegan por `/api/graphql/` al bajar un poco.
 * - **Comentarios**: el comentario destacado de cada post, cuando viene.
 *
 * Las páginas de bebidas alcohólicas, y algunas otras, responden «Este
 * contenido no está disponible en este momento» sin sesión: `RESTRICTED`.
 */

type Json = Record<string, unknown>;

export function jsonBlobs(html: string): unknown[] {
  const blobs: unknown[] = [];
  const pattern = /<script type="application\/json"[^>]*>([\s\S]*?)<\/script>/gu;
  for (const match of html.matchAll(pattern)) {
    try {
      blobs.push(JSON.parse(match[1] ?? ''));
    } catch {
      // Un bloque que no es JSON válido no aporta posts; se sigue con el resto.
    }
  }
  return blobs;
}

/** Las líneas JSON de una respuesta de `/api/graphql/` (Facebook manda varias juntas). */
export function graphqlBlobs(body: string): unknown[] {
  return body
    .split('\n')
    .map((line) => {
      try {
        return JSON.parse(line) as unknown;
      } catch {
        return null;
      }
    })
    .filter(Boolean);
}

function walk(node: unknown, visit: (record: Json) => boolean): void {
  if (!node || typeof node !== 'object') return;
  if (Array.isArray(node)) {
    for (const item of node) walk(item, visit);
    return;
  }
  const record = node as Json;
  if (visit(record)) return;
  for (const value of Object.values(record)) walk(value, visit);
}

function first<T>(node: unknown, pick: (record: Json) => T | undefined): T | undefined {
  let found: T | undefined;
  walk(node, (record) => {
    if (found !== undefined) return true;
    found = pick(record);
    return found !== undefined;
  });
  return found;
}

const asNumber = (value: unknown): number | undefined =>
  typeof value === 'number' && Number.isFinite(value) ? value : undefined;

export function postsFromBlobs(
  blobs: readonly unknown[],
  slug: string,
): { posts: PostReading[]; comments: CommentText[] } {
  const posts = new Map<string, PostReading>();
  const comments: CommentText[] = [];
  for (const blob of blobs) {
    walk(blob, (record) => {
      if (typeof record.post_id !== 'string' || !record.comet_sections || posts.has(record.post_id))
        return false;
      const postId = record.post_id;
      const created = first(record, (node) => asNumber(node.creation_time));
      const text = first(record, (node) => {
        const message = node.message as { text?: unknown } | undefined;
        return typeof message?.text === 'string' ? message.text : undefined;
      });
      const permalink = first(record, (node) =>
        typeof node.permalink_url === 'string'
          ? node.permalink_url
          : typeof node.wwwURL === 'string' && node.wwwURL.includes('/posts/')
            ? node.wwwURL
            : undefined,
      );
      posts.set(postId, {
        slug,
        platform: 'facebook',
        postId,
        url: permalink ?? `https://www.facebook.com/${postId}`,
        publishedAt: created ? new Date(created * 1_000).toISOString().slice(0, 10) : null,
        text: text ?? '',
        likes:
          first(record, (node) => asNumber((node.reaction_count as Json | undefined)?.count)) ??
          null,
        comments:
          first(record, (node) => asNumber((node.comments as Json | undefined)?.total_count)) ??
          null,
        shares:
          first(record, (node) => asNumber((node.share_count as Json | undefined)?.count)) ?? null,
        views: null,
        discovery: 'PROFILE',
        format:
          first(record, (node) =>
            node.__typename === 'Video' ? ('VIDEO' as const)
            : node.__typename === 'Photo' ? ('PHOTO' as const)
            : undefined,
          ) ?? 'TEXT',
        publishedHour: laPazHour(created),
      });
      walk(record, (node) => {
        // Un comentario llega como `{ comment: { depth, body: { text } } }` dentro de
        // `interesting_top_level_comments`, a veces sin `__typename`: lo que lo
        // distingue del texto del post es su profundidad en el hilo.
        const body = (node.body as { text?: unknown } | undefined)?.text;
        const isComment = node.__typename === 'Comment' || typeof node.depth === 'number';
        if (isComment && typeof body === 'string' && body.trim()) {
          comments.push({ slug, platform: 'facebook', postId, text: body.trim() });
          return true;
        }
        return false;
      });
      return true;
    });
  }
  return { posts: [...posts.values()], comments };
}

export function pageFigures(description: string): {
  followers: number | null;
  talkingAbout: number | null;
  likesTotal: number | null;
} {
  return {
    followers: countBefore(description, /(?:seguidores|followers)/),
    talkingAbout: countBefore(description, /(?:personas están hablando|talking about)/),
    likesTotal: countBefore(description, /(?:Me gusta|likes)/),
  };
}

export async function readFacebook(
  context: BrowserContext,
  target: AccountTarget,
): Promise<AccountReading> {
  const page = await context.newPage();
  const extra: unknown[] = [];
  page.on('response', async (response) => {
    if (!response.url().includes('/api/graphql')) return;
    const body = await response.text().catch(() => '');
    extra.push(...graphqlBlobs(body));
  });
  let html: string;
  try {
    await page.goto(target.url, { waitUntil: 'domcontentloaded', timeout: 45_000 });
    await page.waitForTimeout(5_000);
    await page.keyboard.press('Escape').catch(() => undefined);
    for (let round = 0; round < 6; round += 1) {
      await page.mouse.wheel(0, 2_500);
      await page.waitForTimeout(2_000);
    }
    html = await page.content();
  } finally {
    await page.close();
  }
  const evidence = sha256(html);
  if (/Este contenido no está disponible|This content isn't available/u.test(html)) {
    return unread(target, 'RESTRICTED', 'Facebook no muestra la página sin sesión', html, evidence);
  }
  const description = metaContent(html, 'description') ?? metaContent(html, 'og:description');
  if (!description)
    return unread(target, 'BLOCKED', 'la página llegó sin descripción', html, evidence);
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
    html,
  };
}
