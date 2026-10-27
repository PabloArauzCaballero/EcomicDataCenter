/**
 * Un Chromium real abierto en el portal público del SEPREC, y las peticiones a
 * su API hechas desde esa página.
 *
 * Por qué un navegador y no `curl`: `servicios.seprec.gob.bo` está detrás de
 * Cloudflare, que responde «Sorry, you have been blocked» (403, página de
 * bloqueo, sin captcha) a un cliente HTTP plano. La misma petición hecha desde
 * la página `https://miempresa.seprec.gob.bo/#/portal`, que es como la hace el
 * propio portal, responde 200 sin sesión, sin token y sin captcha. Si algún día
 * Cloudflare pide un desafío interactivo, `fetchJson` lo detecta (respuesta no
 * JSON) y se detiene: no se intenta resolver.
 *
 * Variables de entorno:
 *   PW_DIR       carpeta donde está instalado `playwright-core` (npm i playwright-core)
 *   CHROME_PATH  ejecutable de Chromium (por defecto el de ms-playwright)
 */
import { createRequire } from 'node:module';
import { existsSync, readdirSync } from 'node:fs';
import { homedir, freemem } from 'node:os';
import { join } from 'node:path';

export const API = 'https://servicios.seprec.gob.bo/api/';
export const PORTAL = 'https://miempresa.seprec.gob.bo/#/portal';

function chromePath() {
  if (process.env.CHROME_PATH) return process.env.CHROME_PATH;
  const root = join(homedir(), 'AppData', 'Local', 'ms-playwright');
  const dirs = existsSync(root) ? readdirSync(root).filter((d) => /^chromium-\d+$/.test(d)).sort().reverse() : [];
  for (const d of dirs) {
    const exe = join(root, d, 'chrome-win64', 'chrome.exe');
    if (existsSync(exe)) return exe;
  }
  return undefined;
}

export async function openPortal(url = PORTAL) {
  const require = createRequire(process.env.PW_DIR ? join(process.env.PW_DIR, 'package.json') : import.meta.url);
  const { chromium } = require('playwright-core');
  await memoryGuard();
  const browser = await chromium.launch({
    executablePath: chromePath(),
    headless: true,
    args: ['--disable-gpu', '--disable-extensions', '--renderer-process-limit=1', '--js-flags=--max-old-space-size=256'],
  });
  const context = await browser.newContext({ locale: 'es-BO' });
  // Ni imágenes, ni fuentes, ni mosaicos del mapa: solo hace falta el origen de la página.
  await context.route(/\.(png|jpe?g|gif|svg|webp|woff2?|ttf|mp4)(\?|$)/i, (r) => r.abort());
  const page = await context.newPage();
  // Un 500 o un 429 sin cabeceras CORS llega al `fetch` de la página como
  // «Failed to fetch» (status 0); el estado real se lee de la red.
  page.__statuses = new Map();
  page.on('response', (r) => {
    if (r.url().startsWith(API)) page.__statuses.set(r.url(), r.status());
  });
  await page.goto(url, { waitUntil: 'domcontentloaded', timeout: 90_000 });
  await page.waitForTimeout(3000);
  return { browser, page };
}

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

/**
 * GET a la API desde la página. Reintenta con retroceso exponencial ante 429,
 * 5xx o error de red; devuelve `{status, json}` para 2xx y 4xx de negocio
 * (412 «no se encontró la empresa o está inactiva»).
 */
export async function fetchJson(page, path, { tries = 7, timeoutMs = 120_000, body } = {}) {
  let wait = 2000;
  for (let attempt = 1; ; attempt++) {
    let res;
    try {
      res = await page.evaluate(
        async ({ url, timeoutMs, body }) => {
          const ctrl = new AbortController();
          const t = setTimeout(() => ctrl.abort(), timeoutMs);
          try {
            const init = body
              ? { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) }
              : {};
            const r = await fetch(url, { ...init, signal: ctrl.signal });
            const text = await r.text();
            return { status: r.status, text };
          } catch (e) {
            return { status: 0, text: String(e && e.message) };
          } finally {
            clearTimeout(t);
          }
        },
        { url: API + path, timeoutMs, body },
      );
    } catch (e) {
      res = { status: -1, text: String(e && e.message) };
    }
    if (res.status === 0 && page.__statuses?.has(API + path)) {
      res.network = page.__statuses.get(API + path);
      page.__statuses.delete(API + path);
      res.text = `[red ${res.network}] ${res.text}`;
    }
    let json = null;
    try {
      json = JSON.parse(res.text);
    } catch {}
    const retryable = res.status <= 0 || res.status === 429 || res.status >= 500 || (res.status === 403 && !json);
    if (!retryable && json) return { status: res.status, json };
    if (!retryable && !json) throw new Error(`Respuesta no JSON (${res.status}) para ${path}: ${res.text.slice(0, 200)}`);
    if (attempt >= tries) {
      const err = new Error(`Agotados ${tries} intentos (${res.status}) para ${path}: ${res.text.slice(0, 200)}`);
      err.network = res.network ?? res.status;
      throw err;
    }
    console.error(`reintento ${attempt} (${res.status}) en ${Math.round(wait / 1000)}s: ${path} ${res.text.slice(0, 80)}`);
    await sleep(wait + Math.random() * 1000);
    wait = Math.min(wait * 2, 120_000);
  }
}

/**
 * Freno de memoria: la máquina que corre esto es compartida. Si quedan menos de
 * `MIN_FREE_MB` (800 por defecto) de RAM física libre, espera 60 s y vuelve a
 * mirar antes de seguir.
 */
const MIN_FREE_MB = Number(process.env.MIN_FREE_MB ?? 800);
let lastCheck = 0;
export async function memoryGuard() {
  if (Date.now() - lastCheck < 5000) return;
  lastCheck = Date.now();
  while (freemem() / 1024 / 1024 < MIN_FREE_MB) {
    console.error(`RAM libre ${Math.round(freemem() / 1024 / 1024)} MB < ${MIN_FREE_MB}: espero 60 s`);
    await sleep(60_000);
  }
}

/** Ejecuta `worker(item)` sobre `items` con `n` hilos (2 como máximo). */
export async function pool(items, n, worker) {
  let i = 0;
  const runners = Array.from({ length: Math.min(n, 2) }, async () => {
    while (i < items.length) {
      const item = items[i++];
      await memoryGuard();
      await worker(item);
    }
  });
  await Promise.all(runners);
}
