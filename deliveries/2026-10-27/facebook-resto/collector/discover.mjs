// Descubrimiento de páginas de Facebook por buscador: «<rubro> <ciudad> Bolivia facebook».
//
// Bing (el buscador que se usó para las redes de empresas) devolvía, el 27-oct-2026,
// resultados ajenos a la consulta para cualquier búsqueda automatizada (foros húngaros,
// calendarios): está envenenado para este cliente. Yahoo, que sirve el índice de Bing,
// contesta bien desde Chromium y trae títulos y extractos con seguidores. Se consulta una
// a la vez, cada una en un contexto limpio, con pausas al azar; la consulta ya hecha queda
// en `queries.done` y el proceso se reanuda donde quedó.
//
// Uso: node discover.mjs [--shard=i/n]
import { createRequire } from 'node:module';
import fs from 'node:fs';
import { appendLine, file, log, normalizeFb, pause, sleep, waitForRam } from './common.mjs';
import { RUBROS, RUBROS_CORTOS, CIUDADES } from './queries.mjs';

const requireFrom = createRequire(process.env.PLAYWRIGHT_FROM || 'C:/Users/Usuario/Downloads/Entrypoint-GitHUb/ObservatorioEconomico/EcomicDataCenter/package.json');
const { chromium } = requireFrom('playwright');

const shardArg = process.argv.find((a) => a.startsWith('--shard='));
const [shard, shards] = shardArg ? shardArg.slice(8).split('/').map(Number) : [0, 1];

// Las consultas, intercaladas por ciudad para que todas avancen a la par.
const perCity = CIUDADES.map((c) => (c.capital ? RUBROS : RUBROS_CORTOS).map((r) => ({ rubro: r, city: c.name, q: `${r} ${c.query ?? c.name} Bolivia facebook`, pages: c.capital ? 3 : 2 })));
const all = [];
for (let i = 0; perCity.some((l) => i < l.length); i += 1) for (const l of perCity) if (i < l.length) all.push(l[i]);
const mine = all.filter((_, i) => i % shards === shard);

const doneFile = file(`queries.done`);
const done = new Set(fs.existsSync(doneFile) ? fs.readFileSync(doneFile, 'utf8').split('\n').filter(Boolean) : []);
const seenKeys = new Set();
if (fs.existsSync(file('candidates.ndjson'))) {
  for (const l of fs.readFileSync(file('candidates.ndjson'), 'utf8').split('\n')) {
    const m = /"key":"([^"]+)"/.exec(l);
    if (m) seenKeys.add(m[1]);
  }
}

let browser = null;
let loads = 0;
async function getBrowser() {
  if (browser?.isConnected() && loads < 50) return browser;
  if (browser) { await browser.close().catch(() => {}); browser = null; }
  loads = 0;
  await waitForRam();
  browser = await chromium.launch({ headless: true, args: ['--disable-blink-features=AutomationControlled'] });
  return browser;
}

async function yahoo(q, b) {
  const br = await getBrowser();
  const major = br.version().split('.')[0];
  const ctx = await br.newContext({
    locale: 'es-BO', timezoneId: 'America/La_Paz', viewport: { width: 1366, height: 900 },
    userAgent: `Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/${major}.0.0.0 Safari/537.36`,
  });
  await ctx.route('**/*', (route) => (['image', 'media', 'font'].includes(route.request().resourceType()) ? route.abort() : route.continue()));
  const page = await ctx.newPage();
  loads += 1;
  try {
    await page.goto(`https://search.yahoo.com/search?p=${encodeURIComponent(q)}&b=${b}`, { waitUntil: 'domcontentloaded', timeout: 40000 });
    await page.waitForTimeout(1200);
    const html = await page.content();
    const res = await page.$$eval('#web li', (els) => els.map((e) => {
      const a = e.querySelector('h3 a[href], a[href]');
      return { href: a?.href || '', title: e.querySelector('h3')?.textContent || '', snip: e.querySelector('.compText, p')?.textContent || '' };
    }));
    const blocked = !res.length && /captcha|unusual traffic|tr[aá]fico inusual|sorry/i.test(html);
    return { res, blocked, empty: !res.length };
  } finally {
    await ctx.close().catch(() => {});
  }
}

const decodeRU = (u) => {
  const m = /\/RU=([^/]+)\//.exec(u);
  return m ? decodeURIComponent(m[1]) : u;
};

let backoff = 0;
log(`discover shard ${shard}/${shards}: ${mine.length} consultas, ${mine.filter((x) => done.has(x.q)).length} ya hechas`);
let sinceCheck = 0;
for (const item of mine) {
  if (done.has(item.q)) continue;
  if (++sinceCheck >= 10) { sinceCheck = 0; await waitForRam(); }
  let found = 0;
  for (let p = 0; p < item.pages; p += 1) {
    const b = 1 + p * 10;
    let r;
    for (let attempt = 1; attempt <= 3; attempt += 1) {
      try {
        r = await yahoo(item.q, b);
      } catch (e) {
        log('yahoo error', item.q, b, String(e.message).slice(0, 120));
        r = { res: [], blocked: false, empty: true, error: true };
        try { await browser?.close(); } catch { /* ya cerrado */ }
        browser = null;
      }
      if (!r.blocked && !r.error) break;
      backoff = Math.min(backoff ? backoff * 2 : 60, 1800);
      log(`yahoo bloqueado o caído (${item.q} b=${b}); espero ${backoff}s`);
      await sleep(backoff * 1000);
    }
    if (r.blocked) { log('sigue bloqueado; se deja la consulta para otra corrida', item.q); break; }
    backoff = 0;
    let newHere = 0;
    for (const x of r.res) {
      const url = decodeRU(x.href);
      if (!/facebook\.com/i.test(url)) continue;
      const n = normalizeFb(url);
      if (!n) continue;
      if (seenKeys.has(n.key)) continue;
      seenKeys.add(n.key);
      newHere += 1;
      appendLine('candidates.ndjson', {
        key: n.key, url: n.url, found_url: url, title: x.title.trim().slice(0, 200), snippet: x.snip.trim().slice(0, 300),
        query: item.q, rubro: item.rubro, city: item.city, via: 'yahoo', at: new Date().toISOString(),
      });
    }
    found += newHere;
    await pause(2, 4.5);
    // Paginar sólo mientras la página anterior trajo páginas nuevas.
    if (r.empty || newHere === 0) break;
  }
  fs.appendFileSync(doneFile, `${item.q}\n`);
  done.add(item.q);
  log(`q «${item.q}» +${found} (total ${seenKeys.size})`);
}
await browser?.close();
fs.writeFileSync(file(`discover.${shard}.finished`), new Date().toISOString());
log('discover terminado');
