import { mkdirSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { openContext, pause, sleep } from '../company/social-browser';
import { closeRoom, openRoom, pumpChat, type Capture } from './live-capture';
import { Media } from './live-media';
import { discoverFromFeed, launch, liveLinks, wall } from './live-page';
import {
  KIND_TARGET,
  commerceScore,
  kindOf,
  roomState,
  runSalt,
  sellerKey,
  type LiveKind,
  type RoomState,
} from './live-room';
import {
  FIRST_ROOM_FREE_MB,
  MINUTES,
  MIN_FREE_MB,
  MIN_VIEWERS,
  MEDIA,
  ROOMS,
  ROOM_MINUTES,
  RUN,
  RUN_DIR,
  WEEKLY_CAP,
  capturesThisWeek,
  freeMb,
  loadSellers,
  log,
  say,
} from './live-run';

/**
 * Captura de las ventas en vivo de TikTok (plan `PLAN-TIKTOK-LIVES.md`, F3).
 *
 * Lo que midió la sonda del 6-oct-2026 y que este recolector respeta:
 *
 * - El feed `tiktok.com/live` se ve sin sesión desde la conexión de la casa y
 *   está lleno de vendedores bolivianos: de ahí salen los candidatos.
 * - La página de un live muestra el chat sin sesión **solo con el Chrome
 *   instalado y sin bloquear nada**. Bloquear imágenes, video o el stream
 *   dispara un captcha («Selecciona 2 objetos de la misma forma») que no se
 *   resuelve. Cada sala abierta pesa ~1,3 GB: por eso pocas a la vez.
 * - Estado, espectadores, título y stream salen de `api-live/user/room` sin
 *   navegador; la voz y la pantalla las procesa `live_media.py` desde el stream.
 *
 * Nada de quien comenta sale de la máquina: el nombre se convierte en un
 * seudónimo con la sal de la corrida en el momento de leerlo. El vendedor queda
 * en `artifacts/live-raw/sellers.json` (fuera de Git) solo para trazabilidad.
 *
 *   tsx scripts/social/live/collect-live.ts --minutes=300 --rooms=2
 */

async function main(): Promise<void> {
  for (const folder of ['chat', 'events', 'stats', 'speech', 'screen'])
    mkdirSync(join(RUN_DIR, folder), { recursive: true });
  const salt = runSalt(RUN_DIR);
  const key = sellerKey();
  const sellers = loadSellers();
  const media = new Media();
  media.start();
  const browser = await launch();
  const context = await openContext(browser);
  const ends = Date.now() + MINUTES * 60_000;
  const active = new Map<string, Capture>();
  const evaluated = new Map<string, number>();
  const candidates = new Map<string, RoomState>();
  const capturedThisRun = new Set<string>();
  let lastDiscovery = 0;
  // Cuántas salas de cada clase se abrieron: la que más se aleja de su cuota va primero.
  const opened: Record<LiveKind, number> = { VENTA: 0, GASTRONOMIA: 0, ENTRETENIMIENTO: 0 };
  const kindNeed = (kind: LiveKind): number => {
    const total = opened.VENTA + opened.GASTRONOMIA + opened.ENTRETENIMIENTO;
    return KIND_TARGET[kind] - (total ? opened[kind] / total : 0);
  };
  let lapStarted = Date.now();
  let captchas = 0;
  say('run-start', { run: RUN, minutes: MINUTES, rooms: ROOMS, media: MEDIA, freeMb: freeMb() });

  while (Date.now() < ends) {
    // 1. Descubrir cada 12 minutos (o cuando no quedan candidatos).
    const pending = [...candidates.values()].filter((state) => !capturedThisRun.has(state.handle));
    if (
      Date.now() - lastDiscovery > 12 * 60_000 ||
      (pending.length === 0 && Date.now() - lastDiscovery > 3 * 60_000)
    ) {
      lastDiscovery = Date.now();
      if (freeMb() >= MIN_FREE_MB || active.size === 0) {
        const handles = await discoverFromFeed(context, 75);
        for (const capture of active.values())
          for (const handle of await liveLinks(capture.page)) handles.push(handle);
        let fresh = 0;
        for (const handle of new Set(handles)) {
          if (Date.now() - (evaluated.get(handle) ?? 0) < 25 * 60_000) continue;
          evaluated.set(handle, Date.now());
          const state = await roomState(handle);
          const score = commerceScore(state);
          log('candidates.jsonl', {
            t: Date.now(),
            handle,
            live: state.live,
            viewers: state.viewers,
            title: state.title,
            nickname: state.nickname,
            bio: state.bio,
            ...score,
          });
          if (state.live) {
            candidates.set(handle, state);
            fresh += 1;
          } else {
            candidates.delete(handle);
          }
          await pause(0.5, 1.5);
        }
        say('discovery', { seen: new Set(handles).size, live: fresh, freeMb: freeMb() });
      }
    }

    // 2. Abrir salas nuevas si hay lugar y memoria.
    const roomFloor = (): number => (active.size === 0 ? FIRST_ROOM_FREE_MB : MIN_FREE_MB);
    while (active.size < ROOMS && freeMb() >= roomFloor() && captchas < 3) {
      const choice = [...candidates.values()]
        .filter(
          (state) => state.live && !capturedThisRun.has(state.handle) && !active.has(state.handle),
        )
        .filter((state) => (state.viewers ?? 0) >= MIN_VIEWERS)
        .filter((state) => capturesThisWeek(sellers[state.handle]) < WEEKLY_CAP)
        .map((state) => ({ state, score: commerceScore(state) }))
        .map((item) => ({ ...item, kind: kindOf(item.score) }))
        .filter((item): item is typeof item & { kind: LiveKind } => item.kind !== null)
        .sort(
          (a, b) =>
            kindNeed(b.kind) - kindNeed(a.kind) ||
            b.score.commerce +
              b.score.food +
              b.score.fun +
              b.score.bolivia -
              (a.score.commerce + a.score.food + a.score.fun + a.score.bolivia) ||
            Math.random() - 0.5,
        )[0];
      if (!choice) break;
      opened[choice.kind] += 1;
      capturedThisRun.add(choice.state.handle);
      const fresh = await roomState(choice.state.handle);
      if (!fresh.live) continue;
      const capture = await openRoom(context, fresh, sellers, media, key);
      if (!capture) {
        captchas += 1;
        continue;
      }
      captchas = 0;
      active.set(capture.handle, capture);
      void pumpChat(capture, salt);
    }
    if (captchas >= 3) {
      say('cooldown', { reason: 'tres salas seguidas con muro', minutes: 10 });
      captchas = 0;
      await sleep(10 * 60_000);
    }

    // 3. El chat lo lee `pumpChat` sin pausa; aquí, las cifras de cada sala una vez por minuto.
    await sleep(Math.max(5_000, 60_000 - (Date.now() - lapStarted)));
    lapStarted = Date.now();
    for (const capture of active.values()) {
      const state = await roomState(capture.handle);
      log(`stats/${capture.roomId}.jsonl`, {
        t: Date.now(),
        live: state.live,
        viewers: state.viewers,
        entries: state.entries,
      });
      const blocked = await wall(capture.page);
      if (!state.live || blocked === 'ENDED') capture.quietMinutes += 1;
      if (capture.quietMinutes >= 2) {
        capture.done = true;
        capture.reason = 'ENDED';
      } else if (blocked === 'CAPTCHA' || blocked === 'LOGIN') {
        capture.done = true;
        capture.reason = blocked;
      } else if (Date.now() - capture.startedAt > ROOM_MINUTES * 60_000) {
        capture.done = true;
        capture.reason = 'ROTATED';
      } else if (freeMb() < 350) {
        capture.done = true;
        capture.reason = 'LOW_MEMORY';
      }
    }
    for (const capture of [...active.values()].filter((item) => item.done)) {
      await closeRoom(capture, media);
      active.delete(capture.handle);
    }
    writeFileSync(join(RUN_DIR, 'heartbeat'), new Date().toISOString(), 'utf8');
  }

  for (const capture of active.values()) {
    capture.reason = 'BUDGET';
    capture.done = true;
    await closeRoom(capture, media);
  }
  await browser.close();
  say('waiting-media');
  await media.stop();
  say('run-end', { freeMb: freeMb() });
}

void main().catch((error: unknown) => {
  say('fatal', { error: error instanceof Error ? error.stack?.slice(0, 600) : String(error) });
  process.exit(1);
});
