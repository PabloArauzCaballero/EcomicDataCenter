import type { BrowserContext } from 'playwright';
import type { Platform } from './social-links';

/**
 * Lo que un lector de red devuelve de una cuenta.
 *
 * `status` es la primera respuesta, y existe para que ninguna cuenta ilegible
 * llegue al tablero como cero:
 *
 * - `OK`: se leyó el perfil (aunque falten posts o comentarios).
 * - `RESTRICTED`: la red exige mayoría de edad o región (cerveceras, licores).
 * - `BLOCKED`: muro de inicio de sesión, captcha o límite de pedidos.
 * - `NOT_FOUND`: la cuenta no existe o cambió de nombre.
 * - `ERROR`: la página llegó pero no tenía la forma esperada; queda el HTML.
 */

export type ReadStatus = 'OK' | 'RESTRICTED' | 'BLOCKED' | 'NOT_FOUND' | 'ERROR';

export interface ProfileReading {
  readonly slug: string;
  readonly platform: Platform;
  readonly url: string;
  readonly handle: string;
  readonly status: ReadStatus;
  readonly statusNote?: string;
  readonly retrievedAt: string;
  readonly sha256: string | null;
  readonly displayName: string | null;
  readonly followers: number | null;
  readonly following: number | null;
  /** Publicaciones, videos o posts que la red dice que la cuenta tiene. */
  readonly postCount: number | null;
  /** TikTok: corazones acumulados; Facebook: «personas hablando de esto». */
  readonly likesTotal: number | null;
  readonly talkingAbout: number | null;
}

export interface PostReading {
  readonly slug: string;
  readonly platform: Platform;
  readonly postId: string;
  readonly url: string;
  readonly publishedAt: string | null;
  readonly text: string;
  readonly likes: number | null;
  readonly comments: number | null;
  readonly shares: number | null;
  readonly views: number | null;
  /** Cómo se llegó al post: desde el perfil, o por el buscador cuando el perfil no lista. */
  readonly discovery: 'PROFILE' | 'SEARCH';
  /** Reel, video, foto o texto: la forma del post, hasta donde la red la deja ver. */
  readonly format: PostFormat | null;
  /** La hora de La Paz (0–23) cuando la red da el instante y no sólo el día. */
  readonly publishedHour: number | null;
}

export type PostFormat = 'POST' | 'REEL' | 'VIDEO' | 'PHOTO' | 'TEXT';

/** La hora de La Paz (UTC−4, sin horario de verano) de un instante en segundos. */
export function laPazHour(epochSeconds: number | null | undefined): number | null {
  if (!epochSeconds) return null;
  return (new Date(epochSeconds * 1_000).getUTCHours() + 20) % 24;
}

/**
 * El texto de un comentario, sin autor. Vive sólo en el archivo crudo de la
 * corrida (`artifacts/`, no versionado): el análisis lo lee, lo resume y lo
 * suelta. Al seed llegan conteos, sentimiento y palabras, nunca el comentario.
 */
export interface CommentText {
  readonly slug: string;
  readonly platform: Platform;
  readonly postId: string;
  readonly text: string;
}

export interface AccountReading {
  readonly profile: ProfileReading;
  readonly posts: PostReading[];
  readonly comments: CommentText[];
  /** El HTML principal, para guardarlo como evidencia junto a la corrida. */
  readonly html: string | null;
}

export interface AccountTarget {
  readonly slug: string;
  readonly platform: Platform;
  readonly url: string;
  readonly handle: string;
}

/** Lo que el recolector sabe de la cuenta además de su dirección. */
export interface CollectTarget extends AccountTarget {
  readonly name: string;
  readonly origin: 'WEBSITE' | 'SEARCH' | 'MANUAL';
}

export type PlatformReader = (
  context: BrowserContext,
  target: AccountTarget,
) => Promise<AccountReading>;

/** Un perfil sin lectura, con la razón. */
export function unread(
  target: AccountTarget,
  status: Exclude<ReadStatus, 'OK'>,
  statusNote: string,
  html: string | null = null,
  sha256: string | null = null,
): AccountReading {
  return {
    profile: {
      ...target,
      status,
      statusNote,
      retrievedAt: new Date().toISOString(),
      sha256,
      displayName: null,
      followers: null,
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

/** Los N posts con más interacciones: los «principales». */
export function topByInteractions(posts: readonly PostReading[], limit: number): PostReading[] {
  const weight = (post: PostReading): number =>
    (post.likes ?? 0) + (post.comments ?? 0) + (post.shares ?? 0);
  return [...posts].sort((left, right) => weight(right) - weight(left)).slice(0, limit);
}

/** Decodifica las entidades HTML que traen los `content` de las etiquetas meta. */
export function decodeEntities(text: string): string {
  return text
    .replace(/&nbsp;/gu, ' ')
    .replace(/&amp;/gu, '&')
    .replace(/&quot;/gu, '"')
    .replace(/&#039;|&#x27;|&apos;/gu, "'")
    .replace(/&lt;/gu, '<')
    .replace(/&gt;/gu, '>')
    .replace(/&#(\d+);/gu, (_match, code: string) => String.fromCodePoint(Number(code)))
    .replace(/&#x([0-9a-f]+);/giu, (_match, code: string) =>
      String.fromCodePoint(parseInt(code, 16)),
    );
}

export function metaContent(html: string, key: string): string | null {
  const pattern = new RegExp(`<meta[^>]+(?:property|name)="${key}"[^>]+content="([^"]*)"`, 'iu');
  const reversed = new RegExp(`<meta[^>]+content="([^"]*)"[^>]+(?:property|name)="${key}"`, 'iu');
  const found = pattern.exec(html)?.[1] ?? reversed.exec(html)?.[1];
  return found === undefined ? null : decodeEntities(found);
}
