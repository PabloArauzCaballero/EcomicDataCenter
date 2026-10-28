// Lectura de cada página candidata. Facebook entrega la página pública completa (con el
// JSON embebido) a un GET simple con el agente de un Chrome de escritorio: no hace falta
// navegador para esto, y así cada página pesa ~1 MB de red y nada de memoria.
//
// Reanudable: lo leído queda en `fetched.ndjson` (una línea por candidata, con su estado)
// y los registros en `records.ndjson`. Sigue leyendo mientras el descubrimiento corra.
//
// Uso: node fetch-pages.mjs [--concurrency=3]
import fs from 'node:fs';
import crypto from 'node:crypto';
import { appendLine, file, log, pause, readLines, sleep, waitForRam } from './common.mjs';
import { classify, parsePage } from './parse-page.mjs';
import { IN_SCOPE, locate } from './geo.mjs';

const conc = Number(process.argv.find((a) => a.startsWith('--concurrency='))?.slice(14) || 2);
const SHARDS = Number(process.env.FB_DISCOVER_SHARDS || 1);
let handled = 0;
const UA = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/141.0.0.0 Safari/537.36';

const fetched = new Map(readLines('fetched.ndjson').map((x) => [x.key, x]));
const ids = new Set(readLines('records.ndjson').flatMap((r) => [r.source_id, r.raw?.profile_id].filter(Boolean)));
const attempts = new Map();
let consecutiveBlocks = 0;
let cooldownUntil = 0;

async function get(url) {
  const ctrl = new AbortController();
  const t = setTimeout(() => ctrl.abort(), 45000);
  try {
    const r = await fetch(url, {
      signal: ctrl.signal,
      redirect: 'follow',
      headers: {
        'user-agent': UA,
        accept: 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8',
        'accept-language': 'es-BO,es;q=0.9',
        'sec-fetch-mode': 'navigate', 'sec-fetch-dest': 'document', 'sec-fetch-site': 'none', 'sec-fetch-user': '?1',
        'upgrade-insecure-requests': '1',
      },
    });
    return { status: r.status, url: r.url, html: await r.text() };
  } finally {
    clearTimeout(t);
  }
}

const iso = (sec) => (sec ? new Date(sec * 1000).toISOString() : null);

function buildRecord(c, res, p, status, loc) {
  const last = p?.posts?.length ? Math.max(...p.posts) : null;
  const retrieved = new Date().toISOString();
  const canonical = p?.og_url || res?.url || c.url;
  return {
    source: 'facebook',
    source_id: p?.page_id || p?.profile_id || (/^\d+$/.test(c.key) ? c.key : null) || c.key,
    name: p?.name || c.title?.replace(/\s*[-|]\s*Facebook.*$/i, '').replace(/\s*\|\s*[^|]+$/, '').trim() || null,
    category_raw: p?.category || p?.category_api || null,
    address: p?.address || null,
    locality: loc?.locality || null,
    municipality: loc?.municipality || null,
    department: loc?.department || null,
    lat: p?.lat ?? null,
    lon: p?.lon ?? null,
    phone: p?.phone || null,
    website: p?.website || null,
    hours: p?.hours || null,
    source_updated_at: iso(last),
    source_url: canonical,
    retrieved_at: retrieved,
    followers: p?.followers ?? null,
    last_post_at: iso(last),
    status,
    whatsapp: p?.whatsapp || null,
    raw: {
      page_id: p?.page_id || null,
      profile_id: p?.profile_id || null,
      category_en: p?.category_api || null,
      og_description: p?.description || null,
      bio: p?.bio || null,
      city_text: p?.city_text || null,
      desc_city: p?.desc_city || null,
      price_range: p?.price || null,
      services: p?.services || null,
      rating: p?.rating || null,
      likes: p?.likes ?? null,
      talking_about: p?.talking_about ?? null,
      were_here: p?.were_here ?? null,
      websites: p?.websites?.length ? p.websites : undefined,
      intro_items: p?.intro?.filter((i) => !/EMAIL/.test(i.type || '')).map((i) => ({ type: i.type, text: i.text })),
      posts_seen: p?.posts?.length ?? 0,
      location_source: loc?.source || null,
      location_distance_km: loc?.distance_km ?? null,
      discovery: { via: c.via, query: c.query, rubro: c.rubro, city: c.city, found_url: c.found_url, search_title: c.title, search_snippet: c.snippet },
      http_status: res?.status ?? null,
      html_sha256: res?.html ? crypto.createHash('sha256').update(res.html).digest('hex') : null,
    },
  };
}

async function handle(c) {
  let res;
  try {
    res = await get(c.url);
  } catch (e) {
    return { retry: true, why: `red: ${String(e.message).slice(0, 80)}` };
  }
  const status = classify(res.html, res.status);
  if (status === 'BLOCKED') return { retry: true, why: `sin og:title (${res.status}, ${res.html.length} B, ${res.url.slice(0, 80)})`, res };
  if (status === 'NOT_FOUND' || status === 'RESTRICTED') {
    const loc = locate({ queryCity: c.city });
    return { record: buildRecord(c, res, null, status, loc) };
  }
  const p = parsePage(res.html);
  const isPage = Boolean(p.has_delegate) || /^P[aá]gina\b/i.test(p.intro.find((i) => /CATEGORY/.test(i.type || ''))?.text || '');
  if (!isPage) return { skip: 'perfil personal' };
  // «Perfil · Creador(a) digital»: perfil profesional de una persona, no un negocio.
  if (/^Perfil\b/i.test(p.category || '')) return { skip: 'perfil de persona' };
  if ((p.page_id && ids.has(p.page_id)) || (p.profile_id && ids.has(p.profile_id))) return { skip: 'duplicada', id: p.page_id || p.profile_id };
  const loc = locate({ lat: p.lat, lon: p.lon, address: p.address, cityText: p.city_text, descCity: p.desc_city, queryCity: c.city });
  if (loc.out) return { skip: loc.out };
  if (loc.department && !IN_SCOPE.has(loc.department)) return { skip: `fuera de alcance: ${loc.department}` };
  return { record: buildRecord(c, res, p, 'OK', loc) };
}

function pending() {
  const out = [];
  const seen = new Set();
  for (const c of readLines('candidates.ndjson')) {
    if (seen.has(c.key) || fetched.has(c.key)) continue;
    seen.add(c.key);
    out.push(c);
  }
  // Las OSM primero (traen la ciudad segura), luego en orden de hallazgo.
  return out.sort((a, b) => (a.via === 'osm' ? 0 : 1) - (b.via === 'osm' ? 0 : 1));
}

function discoveryFinished() {
  for (let i = 0; i < SHARDS; i += 1) if (!fs.existsSync(file(`discover.${i}.finished`))) return false;
  return true;
}

let okCount = readLines('records.ndjson').length;
log(`fetch: ${fetched.size} ya leídas, ${okCount} registros; concurrencia ${conc}`);

// Tandas: con --max-minutes=N el proceso termina solo y suelta el candado compartido.
const maxMin = Number(process.argv.find((a) => a.startsWith('--max-minutes='))?.slice(14) || 0);
const deadline = maxMin ? Date.now() + maxMin * 60000 : Infinity;

async function worker(queue) {
  while (queue.length && Date.now() < deadline) {
    const c = queue.shift();
    if (fetched.has(c.key)) continue;
    if (++handled % 25 === 0) await waitForRam(300000);
    const wait = cooldownUntil - Date.now();
    if (wait > 0) await sleep(wait);
    const out = await handle(c);
    if (out.retry) {
      const n = (attempts.get(c.key) || 0) + 1;
      attempts.set(c.key, n);
      consecutiveBlocks += 1;
      log(`reintento ${n} ${c.url}: ${out.why}`);
      if (consecutiveBlocks >= 5) {
        const mins = Math.min(5 * 2 ** Math.floor(consecutiveBlocks / 5 - 1), 30);
        cooldownUntil = Date.now() + mins * 60000;
        log(`${consecutiveBlocks} fallos seguidos: pausa de ${mins} min`);
      }
      if (n >= 3) {
        const loc = locate({ queryCity: c.city });
        const rec = buildRecord(c, out.res, null, 'BLOCKED', loc);
        appendLine('records.ndjson', rec);
        fetched.set(c.key, { key: c.key, status: 'BLOCKED' });
        appendLine('fetched.ndjson', { key: c.key, status: 'BLOCKED', at: new Date().toISOString() });
      } else {
        queue.push(c);
      }
      await pause(3, 6);
      continue;
    }
    consecutiveBlocks = 0;
    if (out.record) {
      const r = out.record;
      appendLine('records.ndjson', r);
      for (const id of [r.raw.page_id, r.raw.profile_id]) if (id) ids.add(id);
      okCount += 1;
      fetched.set(c.key, { key: c.key, status: r.status });
      appendLine('fetched.ndjson', { key: c.key, status: r.status, id: r.source_id, dept: r.department, at: r.retrieved_at });
      if (okCount % 25 === 0) log(`${okCount} registros (último: ${r.name} · ${r.department} · ${r.status})`);
    } else {
      fetched.set(c.key, { key: c.key, status: 'SKIP' });
      appendLine('fetched.ndjson', { key: c.key, status: 'SKIP', why: out.skip, id: out.id, at: new Date().toISOString() });
    }
    await pause(1.5, 3.5);
  }
}

for (;;) {
  if (Date.now() >= deadline) { log(`fetch: fin de tanda (${maxMin} min)`); break; }
  const queue = pending();
  if (!queue.length) {
    if (discoveryFinished() && !fs.existsSync(file('osm.pending'))) break;
    // En tandas no se espera al descubrimiento: la tanda siguiente toma lo nuevo.
    if (maxMin) { log('fetch: sin candidatas pendientes; fin de tanda'); break; }
    await sleep(30000);
    continue;
  }
  log(`ronda: ${queue.length} candidatas pendientes`);
  await Promise.all(Array.from({ length: conc }, () => worker(queue)));
}
log(`fetch terminado: ${okCount} registros`);
