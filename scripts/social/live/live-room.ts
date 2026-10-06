import { createHmac, randomBytes } from 'node:crypto';
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { homedir } from 'node:os';
import { dirname, join } from 'node:path';

/**
 * La sala de un live vista sin navegador.
 *
 * `api-live/user/room` responde sin sesión (medido el 6-oct-2026): estado de la
 * sala (2 = en vivo, 4 = apagado), título, espectadores (`userCount`), entradas
 * acumuladas (`enterCount`), hora de inicio, la biografía de la cuenta y las URL
 * del stream. La calidad `ao` es solo audio: de ahí sale la voz del vendedor sin
 * abrir el video en un navegador.
 */

export const UA =
  'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/141.0.0.0 Safari/537.36';

type Json = Record<string, unknown>;

export interface RoomState {
  handle: string;
  found: boolean;
  live: boolean;
  status: number | null;
  roomId: string | null;
  title: string;
  nickname: string;
  bio: string;
  viewers: number | null;
  entries: number | null;
  startedAt: number | null;
  audioUrl: string | null;
  videoUrl: string | null;
  message: string;
}

function text(value: unknown): string {
  return typeof value === 'string' ? value : '';
}

function count(value: unknown): number | null {
  return typeof value === 'number' && Number.isFinite(value) ? value : null;
}

function pullUrls(room: Json | undefined): { audio: string | null; video: string | null } {
  try {
    const pull = (room?.streamData as Json | undefined)?.pull_data as Json | undefined;
    const data =
      (JSON.parse(text(pull?.stream_data)) as { data?: Record<string, { main?: Json }> }).data ??
      {};
    const audio = text(data.ao?.main?.flv) || null;
    const videoKey = ['sd', 'ld', 'hd', 'origin'].find((key) => text(data[key]?.main?.flv));
    return { audio, video: videoKey ? text(data[videoKey]?.main?.flv) : null };
  } catch {
    return { audio: null, video: null };
  }
}

export async function roomState(handle: string): Promise<RoomState> {
  const empty: RoomState = {
    handle,
    found: false,
    live: false,
    status: null,
    roomId: null,
    title: '',
    nickname: '',
    bio: '',
    viewers: null,
    entries: null,
    startedAt: null,
    audioUrl: null,
    videoUrl: null,
    message: '',
  };
  let body: Json | null;
  try {
    const response = await fetch(
      `https://www.tiktok.com/api-live/user/room/?aid=1988&sourceType=54&uniqueId=${encodeURIComponent(handle)}`,
      {
        headers: { 'user-agent': UA, 'accept-language': 'es-BO,es;q=0.9' },
        signal: AbortSignal.timeout(20_000),
      },
    );
    body = (await response.json().catch(() => null)) as Json | null;
    if (!body) return { ...empty, message: `HTTP ${response.status}` };
  } catch (error: unknown) {
    return { ...empty, message: error instanceof Error ? error.message : 'fetch' };
  }
  const data = body.data as Json | null | undefined;
  if (!data) return { ...empty, message: text(body.message) || 'sin datos' };
  const room = data.liveRoom as Json | undefined;
  const user = data.user as Json | undefined;
  const stats = room?.liveRoomStats as Json | undefined;
  const status = count(room?.status);
  const urls = pullUrls(room);
  return {
    handle,
    found: true,
    live: status === 2,
    status,
    roomId: text(user?.roomId) || null,
    title: text(room?.title),
    nickname: text(user?.nickname),
    bio: text(user?.signature),
    viewers: count(stats?.userCount),
    entries: count(stats?.enterCount),
    startedAt: count(room?.startTime),
    audioUrl: urls.audio,
    videoUrl: urls.video,
    message: text(body.message),
  };
}

/**
 * Seudónimo estable de un vendedor o de quien comenta.
 *
 * El vendedor se guarda solo para trazabilidad (decisión del 6-oct-2026): la
 * clave vive en `~/.observatorio-social/live-key`, fuera del repositorio, y con
 * ella el operador puede volver de una cifra a la cuenta. A la semilla llega
 * solo el seudónimo. Para quien comenta se usa la sal de la corrida, que se
 * borra al terminar el análisis: ahí no hay vuelta atrás.
 */
export function pseudonym(value: string, key: Buffer): string {
  return createHmac('sha256', key).update(value.trim().toLowerCase()).digest('hex').slice(0, 16);
}

export function sellerKey(): Buffer {
  const path = join(homedir(), '.observatorio-social', 'live-key');
  if (!existsSync(path)) {
    mkdirSync(dirname(path), { recursive: true });
    writeFileSync(path, randomBytes(32).toString('hex'), 'utf8');
  }
  return Buffer.from(readFileSync(path, 'utf8').trim(), 'hex');
}

export function runSalt(runDir: string): Buffer {
  const path = join(runDir, '.salt');
  if (!existsSync(path)) writeFileSync(path, randomBytes(32).toString('hex'), 'utf8');
  return Buffer.from(readFileSync(path, 'utf8').trim(), 'hex');
}

/**
 * ¿Parece un live de venta? Puntúa título, apodo y biografía con un léxico
 * comercial. Es un filtro de captura, no la clasificación: esa se hace después
 * con el chat y la voz, y un live mal elegido sale como «sin venta».
 */
const COMMERCE = [
  /\bventas?\b/iu,
  /\bvendo\b/iu,
  /\bremate/iu,
  /\bofertas?\b/iu,
  /\bprecios?\b/iu,
  /\bstore\b/iu,
  /\bshop/iu,
  /\btienda/iu,
  /\bboutique/iu,
  /\bmoda\b/iu,
  /\bfardos?\b/iu,
  /\bimporta/iu,
  /\bmercader[ií]a/iu,
  /\bmayor(?:ista)?\b/iu,
  /\bpor mayor\b/iu,
  /\bdetalle\b/iu,
  /\bropa\b/iu,
  /\bcalzados?\b/iu,
  /\bzapat/iu,
  /\bcarteras?\b/iu,
  /\bmaquillaje/iu,
  /\bcosm[eé]tic/iu,
  /\bperfum/iu,
  /\bjoyer/iu,
  /\bbisuter/iu,
  /\baccesorios\b/iu,
  /\bcelulares?\b/iu,
  /\bjuguete/iu,
  /\bnovedades\b/iu,
  /\bestrenos?\b/iu,
  /\bliquidaci[oó]n/iu,
  /\bdescuentos?\b/iu,
  /\benv[ií]os?\b/iu,
  /\bdelivery\b/iu,
  /\bpedidos\b/iu,
  /\bcat[aá]logo/iu,
  /\bemprend/iu,
  /\bcloset\b/iu,
  /\bstyle\b/iu,
  /\bfashion\b/iu,
  /\bbeauty\b/iu,
  /\bcompras?\b/iu,
  /\bnuevo stock\b/iu,
  /\bstock\b/iu,
  /🛍|👗|👠|👜|💄/u,
];
const BOLIVIA = [
  /bolivia|🇧🇴/iu,
  /\bscz\b|santa cruz|la paz|el alto|cochabamba|\bcbba\b|sucre|oruro|potos[ií]|tarija|beni|trinidad|pando|cobija|montero|yacuiba/iu,
  /\bbs\.?\s?\d|\d+\s?bs\b|bolivianos/iu,
  /\+?591/u,
];

export function commerceScore(state: Pick<RoomState, 'title' | 'nickname' | 'bio' | 'handle'>): {
  commerce: number;
  bolivia: number;
} {
  const haystack = `${state.title} ${state.nickname} ${state.bio} ${state.handle.replace(/[._]/gu, ' ')}`;
  return {
    commerce: COMMERCE.filter((pattern) => pattern.test(haystack)).length,
    bolivia: BOLIVIA.filter((pattern) => pattern.test(haystack)).length,
  };
}
