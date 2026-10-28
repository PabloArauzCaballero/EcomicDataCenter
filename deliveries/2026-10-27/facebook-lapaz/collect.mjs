/**
 * Recolector de páginas de negocios de Facebook en el departamento de La Paz.
 *
 *   node collect.mjs [--work=work] [--min-free-mb=781] [--max-queries=N] [--no-discover]
 *
 * Todo en serie (un solo Chromium y un solo contexto abierto a la vez: la laptop
 * es compartida y anda sin RAM), reanudable desde `work/`:
 *
 * 1. Descubrimiento: Yahoo con «site:facebook.com <rubro> <lugar>», cada consulta
 *    en un contexto de navegador limpio. Guarda la consulta hecha y los
 *    candidatos tras cada una.
 * 2. Lectura, justo después de cada consulta: abre cada página nueva SIN sesión
 *    (UA de Chrome real, sin imágenes, fuentes ni CSS), la lee con `parse.mjs` y
 *    guarda una línea por página en `work/pages.ndjson` en cuanto termina.
 *
 * Al reanudar se saltan las consultas y las páginas ya guardadas. Nada se
 * escribe en ninguna base.
 */
import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import os from 'node:os';
import { chromium } from 'playwright';
import { buildQueries } from './queries.mjs';
import { parsePage } from './parse.mjs';

const args = Object.fromEntries(
  process.argv.slice(2).map((a) => {
    const [k, v] = a.replace(/^--/, '').split('=');
    return [k, v ?? true];
  }),
);
const WORK = path.resolve(args.work || 'work');
const MAX_QUERIES = Number(args['max-queries'] || Infinity);
fs.mkdirSync(WORK, { recursive: true });
const F = {
  queries: path.join(WORK, 'queries_done.ndjson'),
  candidates: path.join(WORK, 'candidates.ndjson'),
  pages: path.join(WORK, 'pages.ndjson'),
  log: path.join(WORK, 'run.log'),
};

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const pause = (a, b) => sleep((a + Math.random() * (b - a)) * 1000);
const log = (...m) => {
  const line = `${new Date().toISOString()} ${m.join(' ')}`;
  console.log(line);
  fs.appendFileSync(F.log, line + '\n');
};
const readNd = (f) =>
  fs.existsSync(f)
    ? fs
        .readFileSync(f, 'utf8')
        .split('\n')
        .filter(Boolean)
        .map((l) => {
          try {
            return JSON.parse(l);
          } catch {
            return null;
          }
        })
        .filter(Boolean)
    : [];
const append = (f, obj) => fs.appendFileSync(f, JSON.stringify(obj) + '\n');

// ---------------------------------------------------------------- URL → clave
const RESERVED = new Set(
  (
    'groups events watch marketplace gaming login login.php help policies privacy legal share sharer ' +
    'sharer.php hashtag public story.php photo.php photo photos reel reels video.php videos media l.php ' +
    'business ads settings notes dialog plugins tr search home.php friends messages bookmarks stories ' +
    'live fundraisers places directory careers terms recover r.php permalink.php events.php ' +
    'pg privacy_policy fbml checkpoint watchparty gaming lite mobile about'
  ).split(' '),
);

/** Clave estable de una página a partir de cualquier enlace a ella. */
export function pageKey(raw) {
  let u;
  try {
    u = new URL(raw);
  } catch {
    return null;
  }
  if (!/(^|\.)facebook\.com$/i.test(u.hostname)) return null;
  if (/^business\./i.test(u.hostname)) return null;
  const segs = u.pathname.split('/').filter(Boolean).map((s) => decodeURIComponent(s));
  const id = u.searchParams.get('id');
  if (segs[0] === 'profile.php' && id && /^\d+$/.test(id)) return { key: id, fetch: `https://www.facebook.com/profile.php?id=${id}` };
  if ((segs[0] === 'permalink.php' || segs[0] === 'story.php') && id && /^\d+$/.test(id))
    return { key: id, fetch: `https://www.facebook.com/profile.php?id=${id}` };
  if (!segs.length) return null;
  if (segs[0] === 'p' || segs[0] === 'people') {
    const last = [...segs].reverse().find((s) => /^\d{6,}$/.test(s)) || (/-(\d{6,})$/.exec(segs[1] || '') || [])[1];
    return last ? { key: last, fetch: `https://www.facebook.com/profile.php?id=${last}` } : null;
  }
  if (segs[0] === 'pages') {
    if (segs[1] === 'category') return null;
    const last = segs.find((s) => /^\d{6,}$/.test(s));
    return last ? { key: last, fetch: `https://www.facebook.com/profile.php?id=${last}` } : null;
  }
  const first = segs[0];
  if (RESERVED.has(first.toLowerCase())) return null;
  if (/^\d{6,}$/.test(first)) return { key: first, fetch: `https://www.facebook.com/profile.php?id=${first}` };
  if (!/^[A-Za-z0-9.\-_À-ÿ]{2,80}$/.test(first)) return null;
  return { key: first.toLowerCase(), fetch: `https://www.facebook.com/${encodeURIComponent(first)}/` };
}

// ------------------------------------------------------------------ navegador
let browser;
let ua;
async function launch() {
  for (let attempt = 1; attempt <= 5; attempt += 1) {
    try {
      browser = await chromium.launch({
        headless: true,
        args: ['--disable-blink-features=AutomationControlled', '--disable-gpu', '--disable-dev-shm-usage'],
      });
      const major = browser.version().split('.')[0];
      ua = `Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/${major}.0.0.0 Safari/537.36`;
      return;
    } catch (e) {
      log('launch falló', attempt, e.message);
      await sleep(attempt * 20000);
    }
  }
  throw new Error('no arranca Chromium');
}
async function ensureBrowser() {
  if (!browser || !browser.isConnected()) await launch();
}
async function newContext() {
  await ensureBrowser();
  // Sin JavaScript y sólo el documento: Facebook y Yahoo pintan en el servidor todo
  // lo que se lee (el JSON de la página va en <script type="application/json"> dentro
  // del HTML). Así cada página pesa una fracción de la RAM y tarda ~1 s.
  const ctx = await browser.newContext({
    locale: 'es-BO',
    timezoneId: 'America/La_Paz',
    viewport: { width: 1366, height: 900 },
    userAgent: ua,
    javaScriptEnabled: false,
  });
  await ctx.route('**/*', (r) => (r.request().resourceType() === 'document' ? r.continue() : r.abort()));
  return ctx;
}

// -------------------------------------------------------------------- estado
const queriesDone = new Set(readNd(F.queries).map((q) => q.query));
const candidates = new Map(); // key -> {fetch, queries:Set, titles:Set}
for (const c of readNd(F.candidates)) {
  const prev = candidates.get(c.key);
  if (prev) {
    prev.queries.add(c.query);
  } else {
    candidates.set(c.key, { key: c.key, fetch: c.fetch, queries: new Set([c.query]) });
  }
}
const pagesDone = new Set(readNd(F.pages).filter((p) => p.status !== 'ERROR').map((p) => p.key));
const queue = [...candidates.values()].filter((c) => !pagesDone.has(c.key)).map((c) => c.key);
let discovering = !args['no-discover'];
log(`reanudo: ${queriesDone.size} consultas, ${candidates.size} candidatos, ${pagesDone.size} páginas leídas, ${queue.length} en cola`);

// ------------------------------------------------------------ descubrimiento
async function yahoo(query) {
  let ctx;
  try {
    ctx = await newContext();
    const page = await ctx.newPage();
    await page.goto(`https://search.yahoo.com/search?p=${encodeURIComponent(query)}`, {
      waitUntil: 'domcontentloaded',
      timeout: 30000,
    });
    await page.waitForTimeout(1200);
    const title = await page.title();
    const rows = await page.$$eval('#web ol li h3 a, #web .compTitle a', (as) =>
      as.map((a) => ({ href: a.getAttribute('href') || '', text: (a.textContent || '').trim() })),
    );
    const challenge = !/Yahoo/i.test(title) || /captcha|unusual traffic|_bv\/v\.gif/i.test(page.url());
    return {
      challenge,
      results: rows.map((r) => {
        const m = /\/RU=([^/]+)\/RK=/.exec(r.href);
        return { url: m ? decodeURIComponent(m[1]) : r.href, text: r.text.slice(0, 160) };
      }),
    };
  } finally {
    await ctx?.close().catch(() => undefined);
  }
}

async function discover() {
  const all = buildQueries();
  let done = 0;
  let emptyStreak = 0;
  for (const query of all) {
    if (queriesDone.has(query)) continue;
    if (done >= MAX_QUERIES) break;
    let res;
    await memoryGate();
    try {
      res = await yahoo(query);
    } catch (e) {
      log('yahoo error', query, e.message.slice(0, 100));
      if (/crash|closed|disconnected/i.test(e.message)) {
        // Chromium caído (casi siempre por memoria): se cierra y se relanza en la próxima.
        await browser?.close().catch(() => undefined);
        browser = null;
      }
      await pause(20, 40);
      continue;
    }
    const fb = res.results.filter((r) => /facebook\.com/i.test(r.url));
    if (res.challenge || res.results.length === 0) {
      emptyStreak += 1;
      log(`yahoo vacío/desafío (${emptyStreak}) en «${query}»`);
      if (emptyStreak >= 3) {
        const wait = Math.min(15, 2 * emptyStreak);
        log(`pausa de descubrimiento ${wait} min`);
        await sleep(wait * 60000);
      }
      if (emptyStreak < 8) continue; // se reintenta en otra corrida; no se marca hecha
    }
    emptyStreak = 0;
    let fresh = 0;
    for (const r of fb) {
      const k = pageKey(r.url);
      if (!k) continue;
      append(F.candidates, { key: k.key, fetch: k.fetch, url: r.url, title: r.text, query });
      const prev = candidates.get(k.key);
      if (prev) prev.queries.add(query);
      else {
        candidates.set(k.key, { key: k.key, fetch: k.fetch, queries: new Set([query]) });
        if (!pagesDone.has(k.key)) {
          queue.push(k.key);
          fresh += 1;
        }
      }
    }
    append(F.queries, { query, results: res.results.length, facebook: fb.length, fresh, at: new Date().toISOString() });
    queriesDone.add(query);
    done += 1;
    await drainQueue();
    if (done % 10 === 0)
      log(`descubrimiento: ${queriesDone.size}/${all.length} consultas, ${candidates.size} candidatos, cola ${queue.length}`);
    await pause(3, 7);
  }
  discovering = false;
  log('descubrimiento terminado');
}

// -------------------------------------------------------------------- lectura
let blockedStreak = 0;
async function readOne(ctx, cand) {
  const page = await ctx.newPage();
  try {
    let resp;
    try {
      resp = await page.goto(cand.fetch, { waitUntil: 'domcontentloaded', timeout: 45000 });
    } catch (e) {
      return { status: 'ERROR', note: e.message.slice(0, 120) };
    }
    const html = await page.content();
    const finalUrl = page.url();
    const parsed = parsePage(html, finalUrl);
    parsed.final_url = finalUrl;
    parsed.http_status = resp?.status() ?? null;
    parsed.html_sha256 = crypto.createHash('sha256').update(html).digest('hex');
    parsed.html_bytes = html.length;
    return parsed;
  } finally {
    await page.close().catch(() => undefined);
  }
}

/**
 * La laptop es compartida con otros agentes y anda al borde de la RAM: antes de
 * cada consulta y de cada página se exige memoria libre (por defecto ~800 MB,
 * `--min-free-mb`). Si falta, se cierra el navegador entero y se espera 60 s.
 */
const MIN_FREE = Number(args['min-free-mb'] || 781) * 1024 * 1024;
/**
 * Tandas cortas para el candado compartido de Chromium (`gate.sh`): la corrida
 * termina sola al pasar `--max-minutes` o tras `--max-wait-min` minutos seguidos
 * esperando memoria, para soltar el cupo en vez de retenerlo dormida.
 */
const DEADLINE = Date.now() + Number(args['max-minutes'] || Infinity) * 60000;
const MAX_WAIT = Number(args['max-wait-min'] || Infinity);
class Stop extends Error {}
let readerCtx = null;
async function memoryGate() {
  if (Date.now() > DEADLINE) throw new Stop('tiempo de la tanda cumplido');
  let waited = 0;
  while (os.freemem() < MIN_FREE) {
    if (waited >= MAX_WAIT) throw new Stop(`${waited} min esperando memoria`);
    if (waited === 0) {
      log(`memoria libre ${(os.freemem() / 1048576).toFixed(0)} MB < ${(MIN_FREE / 1048576).toFixed(0)} MB: cierro Chromium y espero`);
      await readerCtx?.close().catch(() => undefined);
      readerCtx = null;
      await browser?.close().catch(() => undefined);
      browser = null;
    }
    await sleep(60000);
    waited += 1;
    if (waited % 5 === 0) log(`sigo esperando memoria (${waited} min, ${(os.freemem() / 1048576).toFixed(0)} MB libres)`);
  }
}

/** Lee, de a una, las páginas en cola. Un solo contexto, cerrado al terminar. */
async function drainQueue() {
  let used = 0;
  try {
    for (;;) {
      const key = queue.shift();
      if (!key) break;
      if (pagesDone.has(key)) continue;
      const cand = candidates.get(key);
      await memoryGate();
      if (!readerCtx || used >= 30) {
        await readerCtx?.close().catch(() => undefined);
        readerCtx = await newContext();
        used = 0;
      }
      used += 1;
      let r;
      try {
        r = await readOne(readerCtx, cand);
      } catch (e) {
        r = { status: 'ERROR', note: e.message.slice(0, 120) };
        await readerCtx?.close().catch(() => undefined);
        readerCtx = null;
      }
      append(F.pages, { key, fetch: cand.fetch, queries: [...cand.queries], retrieved_at: new Date().toISOString(), ...r });
      if (r.status !== 'ERROR') pagesDone.add(key);
      if (r.status === 'BLOCKED') blockedStreak += 1;
      else if (r.status === 'OK' || r.status === 'NOT_PAGE') blockedStreak = 0;
      log(`${r.status} ${key} ${r.name ?? ''} | ${r.address ?? r.meta_city ?? ''} | ${r.lat ?? ''},${r.lon ?? ''} | cola ${queue.length}`);
      if (blockedStreak >= 4) {
        log('muchas BLOCKED seguidas: pausa 10 min');
        await readerCtx?.close().catch(() => undefined);
        readerCtx = null;
        await sleep(10 * 60000);
        blockedStreak = 0;
      }
      await pause(1.5, 4);
    }
  } finally {
    await readerCtx?.close().catch(() => undefined);
    readerCtx = null;
  }
}

try {
  await drainQueue(); // lo pendiente de una corrida anterior
  if (discovering) await discover();
} catch (e) {
  if (e instanceof Stop) log(`fin de tanda: ${e.message}`);
  else log('murió', e.stack);
} finally {
  await readerCtx?.close().catch(() => undefined);
  await browser?.close().catch(() => undefined);
  log('fin');
}

