import type { BrowserContext, Page } from 'playwright';
import { sleep } from '../company/social-browser';
import { eventOf, messageBody } from './live-chat';
import { readChat, wall } from './live-page';
import { commerceScore, pseudonym, type RoomState } from './live-room';
import { RUN, log, saveSellers, say, type SellerRecord } from './live-run';
import type { Media } from './live-media';

/**
 * Una sala abierta: se abre, se lee su chat sin pausa y se cierra con su balance.
 */

// ------------------------------------------------------------------- sala

export interface Capture {
  handle: string;
  roomId: string;
  page: Page;
  startedAt: number;
  keys: Set<string>;
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
    keys: new Set(),
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
    const keyText = `${item.idx}|${item.author}|${item.full}`;
    if (capture.keys.has(keyText)) continue;
    capture.keys.add(keyText);
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
  if (capture.keys.size > 20_000) capture.keys = new Set([...capture.keys].slice(-5_000));
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
