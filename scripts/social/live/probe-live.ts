import { execFileSync } from 'node:child_process';
import { appendFileSync, mkdirSync, writeFileSync } from 'node:fs';
import { freemem } from 'node:os';
import { join } from 'node:path';
import type { BrowserContext, Page } from 'playwright';
import { chromium, type Browser } from 'playwright';
import { launchBrowser, openContext, pause, sleep } from '../company/social-browser';
import { roomState } from './live-room';

/**
 * Sonda de la Fase 0 del plan de ventas en vivo (`PLAN-TIKTOK-LIVES.md`).
 *
 * Mide qué entrega TikTok LIVE sin sesión desde una conexión residencial,
 * antes de escribir el recolector. No resuelve captchas ni inicia sesión: lo
 * que no se deja ver se anota como tal.
 *
 *   tsx scripts/social/live/probe-live.ts status <cuenta> [<cuenta>...]
 *   tsx scripts/social/live/probe-live.ts watch <cuenta> --minutes=10
 *   tsx scripts/social/live/probe-live.ts discover --minutes=5
 *
 * - `status`: la consulta liviana de sala (sin navegador). `liveRoom.status`
 *   2 = en vivo, 4 = apagado (medido el 6-oct-2026).
 * - `watch`: abre el live con imágenes, video y fuentes bloqueados, guarda los
 *   frames del WebSocket de `webcast` (para decodificarlos después) y lo que la
 *   página pinta como chat, minuto a minuto.
 * - `discover`: desplaza el feed `tiktok.com/live` y anota las cuentas que
 *   aparecen en vivo.
 *
 * Todo va a `artifacts/live-probe/<fecha>/`, fuera de Git.
 */

const OUT = join(process.cwd(), 'artifacts', 'live-probe', new Date().toISOString().slice(0, 10));

type Json = Record<string, unknown>;

function flag(name: string, fallback: number): number {
  const raw = process.argv.find((arg) => arg.startsWith(`--${name}=`))?.split('=')[1];
  const parsed = Number(raw);
  return raw && Number.isFinite(parsed) ? parsed : fallback;
}

function freeMb(): number {
  return Math.round(freemem() / 1_048_576);
}

/** Memoria de los Chrome que lanzó Playwright (su perfil temporal lleva «playwright» en la línea de órdenes). */
function chromeMb(): number | null {
  try {
    const out = execFileSync(
      'powershell',
      [
        '-NoProfile',
        '-Command',
        "$p = Get-CimInstance Win32_Process -Filter \"Name='chrome.exe'\" | Where-Object { $_.CommandLine -match 'playwright' }; [math]::Round((($p | ForEach-Object { $_.WorkingSetSize }) | Measure-Object -Sum).Sum / 1MB)",
      ],
      { encoding: 'utf8', timeout: 20_000 },
    );
    return Number(out.trim());
  } catch {
    return null;
  }
}

function memoryGate(): void {
  const minimum = flag('min-free-mb', 1_000);
  if (freeMb() < minimum) {
    console.error(`RAM libre ${freeMb()} MB < ${minimum} MB: no se abre Chromium.`);
    process.exit(2);
  }
}

function log(file: string, row: Json): void {
  appendFileSync(join(OUT, file), `${JSON.stringify(row)}\n`, 'utf8');
}

/** `--channel=chrome` usa el Chrome instalado y `--headed` abre ventana: para medir qué dispara el captcha. */
async function browserFor(): Promise<Browser> {
  const channel = process.argv.find((arg) => arg.startsWith('--channel='))?.split('=')[1];
  const headed = process.argv.includes('--headed');
  if (!channel && !headed) return launchBrowser();
  return chromium.launch({
    headless: !headed,
    ...(channel ? { channel } : {}),
    args: ['--disable-blink-features=AutomationControlled'],
  });
}

async function blockHeavy(context: BrowserContext): Promise<void> {
  if (process.argv.includes('--no-block')) return;
  const listed = process.argv.find((arg) => arg.startsWith('--block='))?.split('=')[1];
  const blocked = new Set((listed ?? 'image,media,font,stream').split(','));
  await context.route('**/*', async (route) => {
    const type = route.request().resourceType();
    if (blocked.has(type)) return route.abort();
    const url = route.request().url();
    if (
      blocked.has('stream') &&
      (/\.(flv|m3u8|ts|mp4)(\?|$)/u.test(url) || url.includes('pull-'))
    ) {
      return route.abort();
    }
    return route.continue();
  });
}

/** Qué pinta la página: muro, captcha o el live. Por texto, porque los selectores cambian. */
async function wall(page: Page): Promise<string | null> {
  const text = (
    await page
      .locator('body')
      .innerText()
      .catch(() => '')
  ).slice(0, 20_000);
  if (
    /captcha|desliza|arrastra el control|verify to continue|objetos de la misma forma|selecciona \d+ objetos|rompecabezas/iu.test(
      text,
    )
  )
    return 'CAPTCHA';
  if (/inicia sesi[oó]n para (ver|continuar)|log in to (watch|continue)/iu.test(text))
    return 'LOGIN';
  if (/no est[aá] en vivo|live has ended|ha finalizado|LIVE ended/iu.test(text)) return 'ENDED';
  return null;
}

async function chatLines(page: Page): Promise<string[]> {
  return page
    .evaluate(() => {
      const nodes = [
        ...document.querySelectorAll(
          '[data-e2e*="chat-message"], [data-e2e*="chat"] [class*="Message"]',
        ),
      ];
      return nodes
        .map((node) => (node as HTMLElement).innerText.replace(/\s+/gu, ' ').trim())
        .filter(Boolean);
    })
    .catch(() => []);
}

async function watch(handle: string): Promise<void> {
  memoryGate();
  const minutes = flag('minutes', 10);
  const before = await roomState(handle);
  console.log('estado previo', before);
  const browser = await browserFor();
  const context = await openContext(browser);
  await blockHeavy(context);
  const page = await context.newPage();
  const cdp = await context.newCDPSession(page);
  await cdp.send('Network.enable');
  const sockets = new Map<string, string>();
  const frames = { total: 0, bytes: 0, webcast: 0 };
  const file = `watch-${handle}.frames.jsonl`;
  cdp.on('Network.webSocketCreated', (event: { requestId: string; url: string }) => {
    sockets.set(event.requestId, event.url);
    log(`watch-${handle}.sockets.jsonl`, { t: Date.now(), url: event.url.split('?')[0] });
  });
  cdp.on(
    'Network.webSocketFrameReceived',
    (event: { requestId: string; response: { opcode: number; payloadData: string } }) => {
      const url = sockets.get(event.requestId) ?? '';
      frames.total += 1;
      frames.bytes += event.response.payloadData.length;
      if (url.includes('webcast')) frames.webcast += 1;
      log(file, {
        t: Date.now(),
        host: url.split('/')[2] ?? '',
        opcode: event.response.opcode,
        payload: event.response.payloadData,
      });
    },
  );
  await page.goto(`https://www.tiktok.com/@${handle}/live`, {
    waitUntil: 'domcontentloaded',
    timeout: 60_000,
  });
  await sleep(8_000);
  writeFileSync(join(OUT, `watch-${handle}.html`), await page.content(), 'utf8');
  await page.screenshot({ path: join(OUT, `watch-${handle}.png`) }).catch(() => undefined);
  const seen = new Set<string>();
  const started = Date.now();
  while (Date.now() - started < minutes * 60_000) {
    if (process.argv.includes('--pause-video')) {
      await page
        .evaluate(() => document.querySelectorAll('video').forEach((video) => video.pause()))
        .catch(() => undefined);
    }
    const lines = await chatLines(page);
    const fresh = lines.filter((line) => !seen.has(line));
    for (const line of fresh) seen.add(line);
    const state = await wall(page);
    const row = {
      t: new Date().toISOString(),
      freeMb: freeMb(),
      chromeMb: chromeMb(),
      wall: state,
      domMessages: lines.length,
      domNew: fresh.length,
      wsFrames: frames.total,
      wsWebcast: frames.webcast,
      wsKb: Math.round(frames.bytes / 1024),
    };
    log(`watch-${handle}.minutes.jsonl`, row);
    console.log(row);
    if (fresh.length) log(`watch-${handle}.dom.jsonl`, { t: Date.now(), lines: fresh });
    if (state === 'CAPTCHA' || state === 'LOGIN' || state === 'ENDED') break;
    if (freeMb() < 500) {
      console.error('RAM libre < 500 MB: se corta la sonda.');
      break;
    }
    await sleep(flag('every', 60) * 1_000);
  }
  await page.screenshot({ path: join(OUT, `watch-${handle}-fin.png`) }).catch(() => undefined);
  await browser.close();
}

async function discover(): Promise<void> {
  memoryGate();
  const minutes = flag('minutes', 5);
  const browser = await browserFor();
  const context = await openContext(browser);
  await blockHeavy(context);
  const page = await context.newPage();
  await page.goto('https://www.tiktok.com/live', {
    waitUntil: 'domcontentloaded',
    timeout: 60_000,
  });
  await sleep(8_000);
  const found = new Map<string, string>();
  const started = Date.now();
  while (Date.now() - started < minutes * 60_000) {
    const links = await page
      .evaluate(() =>
        [...document.querySelectorAll('a[href*="/live"]')].map((a) => ({
          href: (a as HTMLAnchorElement).href,
          text: (a as HTMLElement).innerText.replace(/\s+/gu, ' ').trim().slice(0, 160),
        })),
      )
      .catch(() => []);
    for (const link of links) {
      const handle = /tiktok\.com\/@([\w.]+)\/live/u.exec(link.href)?.[1];
      if (handle && !found.has(handle)) found.set(handle, link.text);
    }
    const state = await wall(page);
    console.log({ t: new Date().toISOString(), found: found.size, wall: state, freeMb: freeMb() });
    if (state === 'CAPTCHA' || state === 'LOGIN') break;
    await page.mouse.wheel(0, 1_800);
    await pause(4, 8);
  }
  writeFileSync(join(OUT, 'discover.html'), await page.content(), 'utf8');
  await browser.close();
  for (const [handle, text] of found) log('discover.jsonl', { handle, text });
  console.log(`${found.size} cuentas en vivo vistas en el feed`);
}

async function main(): Promise<void> {
  mkdirSync(OUT, { recursive: true });
  const [mode, ...rest] = process.argv.slice(2).filter((arg) => !arg.startsWith('--'));
  if (mode === 'status') {
    for (const handle of rest) {
      const status = await roomState(handle);
      log('status.jsonl', { t: new Date().toISOString(), ...status });
      console.log(status);
      await pause(1, 3);
    }
  } else if (mode === 'watch' && rest[0]) {
    await watch(rest[0]);
  } else if (mode === 'discover') {
    await discover();
  } else {
    console.error(
      'uso: probe-live.ts status <cuenta>... | watch <cuenta> --minutes=N | discover --minutes=N',
    );
    process.exit(1);
  }
}

void main();
