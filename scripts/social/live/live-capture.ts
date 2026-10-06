import type { BrowserContext, Page } from 'playwright';
import { sleep } from '../company/social-browser';
import { eventOf, messageBody } from './live-chat';
import { readChat, wall } from './live-page';
import { commerceScore, pseudonym, type RoomState } from './live-room';
import { RUN, log, saveSellers, say, type SellerRecord } from './live-run';
import type { Media } from './live-media';

const DEDUPE_MS = 60_000;

/**
 * Una sala abierta: se abre, se lee su chat sin pausa y se cierra con su balance.
 */

// ------------------------------------------------------------------- sala

export interface Capture {
  handle: string;
  roomId: string;
  page: Page;
  startedAt: number;
  /** Última vez que se vio cada autor+texto: la lista virtual re-renderiza y cambia `data-index`. */
  seen: Map<string, number>;
  nickname: string;
  counts: { chat: number; events: number };
  lastStats: number;
  quietMinutes: number;
  done: boolean;
  reason: string;
}

export async function openRoom(
  context: BrowserContext,
  state: RoomState,
  sellers: Record<string, SellerRecord>,
  media: Media,
  key: Buffer,
): Promise<Capture | null> {
  const page = await context.newPage();
  try {
    await page.goto(`https://www.tiktok.com/@${state.handle}/live`, {
      waitUntil: 'domcontentloaded',
      timeout: 60_000,
    });
    await sleep(9_000);
  } catch (error: unknown) {
    say('room-open-error', {
      handle: state.handle,
      error: error instanceof Error ? error.message.slice(0, 200) : '',
    });
    await page.close().catch(() => undefined);
    return null;
  }
  const blocked = await wall(page);
  const roomId = state.roomId ?? `sin-id-${Date.now()}`;
  const sellerId = pseudonym(state.handle, key);
  const score = commerceScore(state);
  log('rooms.jsonl', {
    phase: 'start',
    at: new Date().toISOString(),
    roomId,
    handle: state.handle,
    sellerId,
    nickname: state.nickname,
    title: state.title,
    bio: state.bio,
    viewers: state.viewers,
    entries: state.entries,
    liveSince: state.startedAt,
    commerce: score.commerce,
    bolivia: score.bolivia,
    wall: blocked,
    audio: Boolean(state.audioUrl),
    video: Boolean(state.videoUrl),
  });
  if (blocked) {
    say('room-blocked', { handle: state.handle, wall: blocked });
    await page.close().catch(() => undefined);
    return null;
  }
  const record = sellers[state.handle] ?? { sellerId, firstSeen: RUN, captures: [] };
  record.captures.push({ run: RUN, roomId, at: new Date().toISOString() });
  sellers[state.handle] = record;
  saveSellers(sellers);
  media.send({ cmd: 'start', room: roomId, audio: state.audioUrl, video: state.videoUrl });
  say('room-start', {
    handle: state.handle,
    roomId,
    viewers: state.viewers,
    title: state.title.slice(0, 80),
  });
  return {
    handle: state.handle,
    roomId,
    page,
    startedAt: Date.now(),
    seen: new Map(),
    nickname: state.nickname,
    counts: { chat: 0, events: 0 },
    lastStats: Date.now(),
    quietMinutes: 0,
    done: false,
    reason: '',
  };
}

export async function drainChat(capture: Capture, salt: Buffer): Promise<void> {
  const items = await readChat(capture.page);
  for (const item of items) {
    // Sin el índice: al re-renderizar, el mismo mensaje vuelve con otro `data-index` (medido el
    // 6-oct-2026: 16 % de duplicados a ~3 s). El mismo autor con el mismo texto dentro de 60 s
    // cuenta una vez.
    const keyText = `${item.author}|${item.full}`;
    const now = Date.now();
    const last = capture.seen.get(keyText);
    capture.seen.set(keyText, now);
    if (last !== undefined && now - last < DEDUPE_MS) continue;
    const author = item.author ? pseudonym(item.author, salt) : null;
    const t = Date.now();
    if (item.chat) {
      const body = messageBody(item);
      if (!body) continue;
      capture.counts.chat += 1;
      log(`chat/${capture.roomId}.jsonl`, {
        t,
        author,
        host: Boolean(item.author) && item.author === capture.nickname,
        text: body,
      });
    } else {
      const event = eventOf(
        item.ownerText && item.full.startsWith(item.ownerText)
          ? item.full.slice(item.ownerText.length).trim()
          : item.full,
        item.author,
      );
      if (!event) continue;
      if (event.kind === 'other' && process.argv.includes('--debug-events'))
        console.log('OTHER', item.full.slice(0, 80));
      capture.counts.events += 1;
      log(`events/${capture.roomId}.jsonl`, { t, author, ...event });
    }
  }
  if (capture.seen.size > 20_000) {
    const cutoff = Date.now() - DEDUPE_MS;
    for (const [key, at] of capture.seen) if (at < cutoff) capture.seen.delete(key);
  }
}

/**
 * Lee el chat de una sala cada 1,5 s mientras esté abierta. Corre aparte del
 * bucle principal: mientras este descubre candidatos (más de dos minutos), la
 * lista virtual del chat sigue corriendo y lo que no se lee se pierde.
 */
export async function pumpChat(capture: Capture, salt: Buffer): Promise<void> {
  while (!capture.done) {
    await drainChat(capture, salt);
    await sleep(1_500);
  }
}

export async function closeRoom(capture: Capture, media: Media): Promise<void> {
  media.send({ cmd: 'stop', room: capture.roomId });
  await capture.page.close().catch(() => undefined);
  log('rooms.jsonl', {
    phase: 'end',
    at: new Date().toISOString(),
    roomId: capture.roomId,
    handle: capture.handle,
    minutes: Math.round((Date.now() - capture.startedAt) / 60_000),
    chat: capture.counts.chat,
    events: capture.counts.events,
    reason: capture.reason,
  });
  say('room-end', { handle: capture.handle, chat: capture.counts.chat, reason: capture.reason });
}
