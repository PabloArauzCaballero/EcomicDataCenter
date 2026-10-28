/**
 * Lectura de páginas de Facebook sin sesión (departamento de Santa Cruz).
 *
 * Lee work/candidates.ndjson (lo escribe discover.mjs, que puede seguir corriendo) y
 * guarda una línea por candidato en work/results.ndjson, tras cada página. Reanuda.
 *
 * Qué se lee de la página pública (sin iniciar sesión, cerrando el aviso):
 * - `meta description`: seguidores, «Me gusta», «estuvieron aquí».
 * - JSON embebido: `delegate_page` (id y categoría de la página), la lista «Detalles»
 *   de la portada (`timeline_context_item`): categoría, dirección —con lat/lon en el
 *   enlace a Google Maps—, teléfono, web, horario, rango de precios.
 * - `creation_time` de los posts embebidos o cargados por /api/graphql/: último post.
 * - El horario completo sale del diálogo que se abre al pulsar «Abierto ahora».
 *
 * Los perfiles personales se descartan sin guardar ningún dato (sólo su clave, para
 * no volver a visitarlos). Los correos no se guardan nunca.
 *
 * Uso: node fetch.mjs [concurrencia=2] [--once]
 */
import { createRequire } from 'node:module';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const require = createRequire('C:/Users/Usuario/Downloads/Entrypoint-GitHUb/ObservatorioEconomico/EcomicDataCenter/package.json');
const { chromium } = require('playwright');

const HERE = path.dirname(fileURLToPath(import.meta.url));
const WORK = path.join(HERE, 'work');
const CANDIDATES = path.join(WORK, 'candidates.ndjson');
const RESULTS = path.join(WORK, 'results.ndjson');
const DONE_FLAG = path.join(WORK, 'discover.done');
const DEBUG_DIR = process.env.FB_DEBUG ? path.join(WORK, 'debug') : null;
if (DEBUG_DIR) fs.mkdirSync(DEBUG_DIR, { recursive: true });

const CONCURRENCY = Number(process.argv[2] ?? 2);
const ONCE = process.argv.includes('--once');
const LIMIT = Number(process.env.FB_LIMIT ?? Infinity);

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
// Umbral de memoria libre (MB): el candado compartido gate.sh usa 700 para Chromium y 300 para HTTP.
const MIN_FREE_MB = Number(process.env.MIN_FREE_MB ?? 800);
// Cada tanda dura como mucho TANDA_MIN minutos (turnos de 40 min del candado).
const TANDA_END = Date.now() + Number(process.env.TANDA_MIN ?? 1e9) * 60_000;
const pause = (a, b) => sleep((a + Math.random() * (b - a)) * 1000);

function readNdjson(file) {
  if (!fs.existsSync(file)) return [];
  return fs.readFileSync(file, 'utf8').split('\n').filter(Boolean).map((l) => { try { return JSON.parse(l); } catch { return null; } }).filter(Boolean);
}

// ---------------------------------------------------------------- geografía
const SCZ_MUNICIPALITIES = [
  'Santa Cruz de la Sierra', 'Cotoca', 'Porongo', 'La Guardia', 'El Torno', 'Warnes', 'Okinawa Uno', 'Montero',
  'General Saavedra', 'Mineros', 'Fernández Alonso', 'San Pedro', 'Portachuelo', 'Santa Rosa del Sara',
  'Colpa Bélgica', 'Buena Vista', 'San Carlos', 'Yapacaní', 'San Juan', 'Ascensión de Guarayos', 'Urubichá',
  'El Puente', 'Concepción', 'San Javier', 'San Ramón', 'San Julián', 'Cuatro Cañadas',
  'San Antonio de Lomerío', 'San Ignacio de Velasco', 'San Miguel de Velasco', 'San Rafael', 'San José de Chiquitos',
  'Pailón', 'Roboré', 'Puerto Suárez', 'Puerto Quijarro', 'Carmen Rivero Tórrez', 'San Matías', 'Camiri',
  'Lagunillas', 'Charagua', 'Cabezas', 'Cuevo', 'Gutiérrez', 'Boyuibe', 'Vallegrande', 'Trigal', 'Moro Moro',
  'Postrervalle', 'Pucará', 'Samaipata', 'Pampa Grande', 'Mairana', 'Quirusillas', 'Comarapa', 'Saipina',
];
const fold = (s) => (s ?? '').normalize('NFD').replace(/\p{Diacritic}/gu, '').toLowerCase().replace(/\s+/g, ' ').trim();
/** Nombre de lugar (plegado) → municipio de Santa Cruz. */
const SCZ_ALIASES = new Map();
for (const m of SCZ_MUNICIPALITIES) SCZ_ALIASES.set(fold(m), m);
for (const [alias, m] of Object.entries({
  'santa cruz': 'Santa Cruz de la Sierra', 'santa cruz de la sierra, bolivia': 'Santa Cruz de la Sierra',
  'scz': 'Santa Cruz de la Sierra', 'okinawa': 'Okinawa Uno', 'saavedra': 'General Saavedra',
  'ascension': 'Ascensión de Guarayos', 'guarayos': 'Ascensión de Guarayos', 'san ignacio': 'San Ignacio de Velasco',
  'san jose': 'San José de Chiquitos', 'puerto quijarro': 'Puerto Quijarro', 'quijarro': 'Puerto Quijarro',
  'arroyo concepcion': 'Puerto Quijarro', 'puerto suarez': 'Puerto Suárez', 'san juan de yapacani': 'San Juan',
  'urubo': 'Porongo', 'ayacucho': 'Porongo', 'satelite norte': 'Warnes', 'paurito': 'Santa Cruz de la Sierra',
  'san miguel': 'San Miguel de Velasco', 'san rafael de velasco': 'San Rafael', 'cuatro canadas': 'Cuatro Cañadas',
  'pailas': 'Cotoca', 'puerto pailas': 'Cotoca', 'abapo': 'Cabezas', 'montero, bolivia': 'Montero',
  'el torno, bolivia': 'El Torno', 'la guardia, bolivia': 'La Guardia', 'colpa belgica': 'Colpa Bélgica',
})) SCZ_ALIASES.set(alias, m);
const OTHER_DEPTS = new Map(Object.entries({
  'la paz': 'La Paz', 'el alto': 'La Paz', 'cochabamba': 'Cochabamba', 'quillacollo': 'Cochabamba', 'sacaba': 'Cochabamba',
  'oruro': 'Oruro', 'potosi': 'Potosí', 'sucre': 'Chuquisaca', 'tarija': 'Tarija', 'yacuiba': 'Tarija',
  'trinidad': 'Beni', 'riberalta': 'Beni', 'guayaramerin': 'Beni', 'cobija': 'Pando', 'villamontes': 'Tarija',
  'bermejo': 'Tarija', 'uyuni': 'Potosí', 'tupiza': 'Potosí', 'villazon': 'Potosí', 'llallagua': 'Potosí',
  'punata': 'Cochabamba', 'tiquipaya': 'Cochabamba', 'colcapirhua': 'Cochabamba', 'vinto': 'Cochabamba',
  'viacha': 'La Paz', 'copacabana': 'La Paz', 'caranavi': 'La Paz', 'san borja': 'Beni', 'rurrenabaque': 'Beni',
  'monteagudo': 'Chuquisaca', 'shinahota': 'Cochabamba', 'villa tunari': 'Cochabamba', 'ivirgarzama': 'Cochabamba',
  'entre rios': 'Tarija', 'puerto villarroel': 'Cochabamba', 'chimore': 'Cochabamba', 'aiquile': 'Cochabamba',
}));
const FOREIGN_RE = /\b(peru|argentina|brasil|brazil|chile|paraguay|mexico|colombia|ecuador|venezuela|espa[nñ]a|spain|usa|estados unidos|corumba|lima|buenos aires|asuncion|sao paulo|miami)\b/;

function locate(addressText, titleCity) {
  const pieces = [];
  if (addressText) pieces.push(...addressText.split(',').map((x) => x.trim()));
  if (titleCity) pieces.push(titleCity.trim());
  // De lo más específico a lo general: la ciudad suele ir antes de «Bolivia».
  const ordered = [...pieces].reverse();
  for (const p of ordered) {
    const f = fold(p).replace(/^(ciudad de|municipio de)\s+/, '');
    if (SCZ_ALIASES.has(f)) return { locality: p, municipality: SCZ_ALIASES.get(f), department: 'Santa Cruz' };
  }
  for (const p of ordered) {
    const f = fold(p);
    if (OTHER_DEPTS.has(f)) return { locality: p, municipality: null, department: OTHER_DEPTS.get(f) };
  }
  const all = fold([addressText, titleCity].filter(Boolean).join(' '));
  if (FOREIGN_RE.test(all) && !/\bbolivia\b/.test(all)) return { locality: titleCity ?? null, municipality: null, department: 'EXTRANJERO' };
  for (const [alias, m] of SCZ_ALIASES) if (alias.length >= 6 && all.includes(alias)) return { locality: m, municipality: m, department: 'Santa Cruz' };
  return { locality: titleCity ?? null, municipality: null, department: null };
}
/** Santa Cruz es grande; esta caja deja fuera casi todo Beni, Cochabamba y Chuquisaca, no todo. */
const inSczBox = (lat, lon) => lat <= -13.4 && lat >= -20.7 && lon >= -64.75 && lon <= -57.4 && !(lat > -15.6 && lon < -62.5);

// ---------------------------------------------------------------- extracción
function jsonBlobs(html) {
  const out = [];
  for (const m of html.matchAll(/<script type="application\/json"[^>]*>([\s\S]*?)<\/script>/g)) {
    try { out.push(JSON.parse(m[1])); } catch { /* bloque no JSON */ }
  }
  return out;
}
function gqlBlobs(body) {
  return body.split('\n').map((l) => { try { return JSON.parse(l); } catch { return null; } }).filter(Boolean);
}
function walk(node, visit) {
  if (!node || typeof node !== 'object') return;
  if (Array.isArray(node)) { for (const x of node) walk(x, visit); return; }
  if (visit(node)) return;
  for (const v of Object.values(node)) walk(v, visit);
}
function meta(html, name) {
  const re = new RegExp(`<meta[^>]+(?:name|property)="${name}"[^>]+content="([^"]*)"`, 'i');
  const v = re.exec(html)?.[1];
  return v === undefined ? null : decodeEntities(v);
}
function decodeEntities(s) {
  return s.replace(/&nbsp;/g, ' ').replace(/&amp;/g, '&').replace(/&quot;/g, '"').replace(/&#039;|&#x27;/g, "'").replace(/&lt;/g, '<').replace(/&gt;/g, '>')
    .replace(/&#(\d+);/g, (_, d) => String.fromCodePoint(Number(d))).replace(/&#x([0-9a-f]+);/gi, (_, h) => String.fromCodePoint(parseInt(h, 16)));
}
function countBefore(text, wordRe) {
  const m = new RegExp(`([\\d.,\\s]+)\\s*(?:mil\\s+)?${wordRe.source}`, 'iu').exec(text);
  if (!m) return null;
  const raw = m[1].trim().replace(/\s/g, '');
  // «7.866» y «7,866» son miles; «1,2 mil» no llega a la descripción (trae la cifra completa).
  const n = Number(raw.replace(/[.,]/g, ''));
  return Number.isFinite(n) ? n : null;
}
function textOf(t) { return typeof t?.text === 'string' ? t.text : null; }
function firstExternalUrl(title) {
  for (const r of title?.ranges ?? []) {
    const e = r.entity;
    const u = e?.external_url ?? e?.web_link?.url ?? e?.url;
    if (u) return u;
  }
  return null;
}
function unwrapFbLink(u) {
  if (!u) return null;
  try {
    const url = new URL(u);
    if (/l\.facebook\.com$/.test(url.hostname) && url.searchParams.get('u')) return url.searchParams.get('u');
  } catch { /* no es URL */ }
  return u;
}
function coordsFromMapUrl(u) {
  if (!u) return null;
  let s = u;
  for (let i = 0; i < 3; i += 1) { try { const d = decodeURIComponent(s); if (d === s) break; s = d; } catch { break; } }
  const m = /(?:q=|where1=|ll=|@)(-?\d{1,2}\.\d+)\s*,\s*\+?(-?\d{1,3}\.\d+)/.exec(s);
  if (!m) return null;
  const lat = Number(m[1]); const lon = Number(m[2]);
  return Number.isFinite(lat) && Number.isFinite(lon) && !(lat === 0 && lon === 0) ? { lat, lon } : null;
}
const PHONE_RE = /^\+?[\d\s\-().]{6,22}$/;

export function extract(html, extra = []) {
  const blobs = [...jsonBlobs(html), ...extra];
  const r = { items: [] };
  r.profile_id = /fb:\/\/profile\/(\d+)/.exec(html)?.[1] ?? /fb:\/\/page\/\?id=(\d+)/.exec(html)?.[1] ?? null;
  walk(blobs, (n) => {
    if (!r.delegate && n.delegate_page && typeof n.delegate_page === 'object' && n.delegate_page.id && n.delegate_page.category_name) {
      r.delegate = { id: n.delegate_page.id, name: n.delegate_page.name ?? null, category: n.delegate_page.category_name };
    }
    if (n.timeline_context_item?.renderer) {
      const rr = n.timeline_context_item.renderer;
      const ci = rr.context_item ?? {};
      r.items.push({ type: rr.__typename, text: textOf(ci.plaintext_title) ?? textOf(ci.title), url: firstExternalUrl(ci.title) });
      return true;
    }
    if (typeof n.field_type === 'string' && n.title) {
      r.items.push({ type: `field:${n.field_type}`, text: textOf(n.title), url: n.link_url ?? null });
    }
    if (n.map_pin_coordinates?.latitude !== undefined && !r.pin) r.pin = { lat: n.map_pin_coordinates.latitude, lon: n.map_pin_coordinates.longitude };
    // Página de lugar no reclamada (facebook.com/pages/<nombre>/<id>): campos sueltos.
    if (!r.place && typeof n.latitude === 'number' && typeof n.longitude === 'number' && n.address && typeof n.address.full_address === 'string') {
      r.place = {
        lat: n.latitude, lon: n.longitude, address: n.address.full_address,
        phone: typeof n.formatted_phone_number === 'string' ? n.formatted_phone_number : null,
        website: typeof n.website === 'string' ? n.website : null,
      };
    }
    return false;
  });
  // Último post: el mayor creation_time de un post; si no hay posts reconocibles, el mayor de cualquiera.
  let lastPost = 0; let lastAny = 0;
  const nowS = Date.now() / 1000;
  walk(blobs, (n) => {
    const t = typeof n.creation_time === 'number' ? n.creation_time : null;
    if (t && t > 1.08e9 && t < nowS + 86400) {
      lastAny = Math.max(lastAny, t);
      if (n.post_id || n.comet_sections || n.__typename === 'Story') lastPost = Math.max(lastPost, t);
    }
    return false;
  });
  const best = lastPost || lastAny;
  r.last_post_at = best ? new Date(best * 1000).toISOString() : null;
  const htmlTitle = /<title>([^<]*)<\/title>/.exec(html)?.[1];
  r.title = meta(html, 'og:title') ?? (htmlTitle ? decodeEntities(htmlTitle) : null);
  r.description = meta(html, 'description') ?? meta(html, 'og:description');
  const wa = /(?:wa\.me\/|api\.whatsapp\.com\/send\/?\?phone=|whatsapp\.com\/send\?phone=)(\+?\d{8,15})/.exec(html.replace(/\\\//g, '/').replace(/%2F/gi, '/').replace(/%3F/gi, '?').replace(/%3D/gi, '=').replace(/%2B/gi, '+'));
  r.whatsapp = wa?.[1] ?? null;
  return r;
}

function normalize(cand, r, hoursText, aboutPin) {
  const items = r.items;
  const find = (pred) => items.find(pred);
  const catItem = find((i) => i.type === 'InfluencerCategoryContextItemRenderer' || i.type === 'field:category');
  let category = catItem?.text ?? null;
  if (category) category = category.replace(/^(Página|Page)\s*·\s*/u, '').trim();
  const addrItem = find((i) => i.type === 'AddressContextItemRenderer' || i.type === 'field:address');
  const address = addrItem?.text ?? r.place?.address ?? null;
  const coords = coordsFromMapUrl(addrItem?.url) ?? r.pin ?? aboutPin ?? (r.place ? { lat: r.place.lat, lon: r.place.lon } : null);
  const phoneItem = find((i) => (i.type === 'field:profile_phone') || (i.type === 'ContextItemDefaultRenderer' && i.text && PHONE_RE.test(i.text) && i.text.replace(/\D/g, '').length >= 7));
  const webItem = find((i) => i.type === 'WebsiteContextItemRenderer' || i.type === 'field:website');
  let website = webItem ? unwrapFbLink(webItem.url) ?? webItem.text : (r.place?.website ?? null);
  if (website && !/^https?:/i.test(website)) website = `https://${website}`;
  const hoursItem = find((i) => i.type === 'BusinessHoursContextItemRenderer' || i.type === 'field:business_hours');
  const priceItem = find((i) => i.type === 'field:business_price' || (i.type === 'ContextItemDefaultRenderer' && /^Rango de precios/i.test(i.text ?? '')));
  const waItem = find((i) => /whatsapp/i.test(i.type) || /whatsapp/i.test(i.url ?? ''));
  const titleParts = (r.title ?? '').split(' | ');
  const name = r.delegate?.name ?? titleParts[0]?.trim() ?? cand.title ?? null;
  const titleCity = titleParts.length > 1 ? titleParts.slice(1).join(' | ').trim() || null : null;
  const loc = locate(address, titleCity);
  if (!loc.department && coords && inSczBox(coords.lat, coords.lon)) { loc.department = 'Santa Cruz'; loc.inferred = 'coordenadas'; }
  const desc = r.description ?? '';
  const followers = countBefore(desc, /(?:seguidores|followers)/) ?? countBefore(desc, /(?:Me gusta|likes)/);
  return {
    name,
    category_raw: category,
    category_fb_en: r.delegate?.category ?? null,
    address,
    locality: loc.locality,
    municipality: loc.municipality,
    department: loc.department,
    department_inferred_from: loc.inferred ?? (loc.department ? 'direccion_o_ciudad_de_la_pagina' : null),
    lat: coords?.lat ?? null,
    lon: coords?.lon ?? null,
    phone: phoneItem?.text?.trim() ?? r.place?.phone ?? null,
    page_kind: r.place && !r.items.length ? 'lugar_no_reclamado' : 'pagina',
    website,
    whatsapp: r.whatsapp ?? (waItem ? (/(\d{8,15})/.exec(waItem.url ?? waItem.text ?? '')?.[1] ?? null) : null),
    hours: hoursText ?? null,
    hours_status_at_read: hoursItem?.text ?? null,
    price_range: priceItem?.text?.replace(/^Rango de precios\s*·\s*/i, '') ?? null,
    followers,
    likes: countBefore(desc, /(?:Me gusta|likes)/),
    talking_about: countBefore(desc, /(?:personas están hablando|talking about)/),
    were_here: countBefore(desc, /(?:personas estuvieron aquí|were here)/),
    last_post_at: r.last_post_at,
    page_city: titleCity,
    intro_items: items.filter((i) => !/email|correo/i.test(i.type)).map((i) => ({ type: i.type, text: i.text && /@/.test(i.text) ? null : i.text })),
  };
}

function formatHours(dialogText) {
  if (!dialogText) return null;
  const lines = dialogText.split('\n').map((l) => l.trim()).filter(Boolean).filter((l) => l !== 'Horario');
  const DAYS = /^(Lunes|Martes|Miércoles|Jueves|Viernes|Sábado|Domingo|Monday|Tuesday|Wednesday|Thursday|Friday|Saturday|Sunday)$/i;
  const out = []; let day = null;
  for (const l of lines) {
    if (/^(Updated|Actualizad|Horas con más actividad|Servicios|Popular times)/i.test(l)) break;
    if (DAYS.test(l)) { day = l; out.push(`${l}:`); continue; }
    if (day) out[out.length - 1] += ` ${l}`;
  }
  if (out.length) return out.map((x) => x.replace(/:\s*/, ': ')).join('; ');
  return lines.slice(0, 3).join(' · ') || null;
}

// ---------------------------------------------------------------- navegador
let browser = null;
async function getBrowser() {
  if (browser?.isConnected()) return browser;
  browser = await chromium.launch({ headless: true, args: ['--disable-blink-features=AutomationControlled'] });
  return browser;
}
async function newCtx() {
  const b = await getBrowser();
  const major = b.version().split('.')[0];
  return b.newContext({
    locale: 'es-BO', timezoneId: 'America/La_Paz', viewport: { width: 1366, height: 900 },
    userAgent: `Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/${major}.0.0.0 Safari/537.36`,
  });
}

async function readPage(cand) {
  const ctx = await newCtx();
  const extra = [];
  try {
    const page = await ctx.newPage();
    await page.route('**/*', (route) => (['image', 'media', 'font'].includes(route.request().resourceType()) ? route.abort() : route.continue()));
    page.on('response', async (resp) => {
      if (!resp.url().includes('/api/graphql')) return;
      const body = await resp.text().catch(() => '');
      extra.push(...gqlBlobs(body));
    });
    const slugId = /-(\d{9,})$/.exec(cand.key)?.[1];
    const target = slugId ? `https://www.facebook.com/profile.php?id=${slugId}` : cand.url;
    const resp = await page.goto(target, { waitUntil: 'domcontentloaded', timeout: 45000 });
    await page.waitForTimeout(3000);
    await page.keyboard.press('Escape').catch(() => undefined);
    await page.waitForTimeout(400);
    const finalUrl = page.url();
    let html = await page.content();
    const httpStatus = resp?.status() ?? null;
    if (/\/login|\/checkpoint|login\.php/.test(finalUrl) && !/og:title/.test(html)) return { status: 'BLOCKED', note: `redirigido a ${finalUrl.slice(0, 80)}`, finalUrl, httpStatus };
    if (/Este contenido no está disponible|This content isn't available|Esta página no está disponible|This page isn't available/u.test(html) && !/delegate_page/.test(html)) {
      return { status: httpStatus === 404 ? 'NOT_FOUND' : 'RESTRICTED', note: 'Facebook no muestra la página sin sesión', finalUrl, httpStatus };
    }
    if (httpStatus === 404) return { status: 'NOT_FOUND', note: 'HTTP 404', finalUrl, httpStatus };
    if (!/og:title|name="description"/.test(html)) return { status: 'BLOCKED', note: 'la página llegó sin metadatos', finalUrl, httpStatus };
    // Horario completo: el diálogo que abre el estado («Abierto ahora», «Cerrado ahora»…).
    let hoursText = null;
    if (/BusinessHoursContextItemRenderer/.test(html)) {
      try {
        const loc = page.getByText(/^(Abierto ahora|Cerrado ahora|Siempre abierto|Cierra pronto|Abre pronto|Cerrado temporalmente|Cerrado permanentemente|Sin horario|Abierto|Cerrado)/).first();
        if (await loc.count()) {
          await loc.click({ timeout: 4000 });
          await page.waitForTimeout(2200);
          const dlg = await page.locator('[role="dialog"]').allInnerTexts().catch(() => []);
          hoursText = formatHours(dlg.find((t) => /Horario|Lunes|Domingo|Siempre/i.test(t)) ?? null);
          await page.keyboard.press('Escape').catch(() => undefined);
        }
      } catch { /* sin horario detallado */ }
    }
    // Un poco de desplazamiento para que lleguen los posts (último post).
    for (let i = 0; i < 1; i += 1) { await page.mouse.wheel(0, 2200).catch(() => undefined); await page.waitForTimeout(1200); }
    html = await page.content().catch(() => html);
    if (DEBUG_DIR) fs.writeFileSync(path.join(DEBUG_DIR, `${cand.key.replace(/[^\w.-]/g, '_')}.html`), html);
    return { status: 'OK', html, extra, hoursText, finalUrl, httpStatus };
  } finally {
    await ctx.close().catch(() => undefined);
  }
}

async function readAboutPin(url) {
  const aboutUrl = url.includes('profile.php') ? `${url}&sk=about_contact_and_basic_info` : `${url.replace(/\/$/, '')}/about_contact_and_basic_info`;
  const ctx = await newCtx();
  try {
    const page = await ctx.newPage();
    await page.route('**/*', (route) => (['image', 'media', 'font'].includes(route.request().resourceType()) ? route.abort() : route.continue()));
    await page.goto(aboutUrl, { waitUntil: 'domcontentloaded', timeout: 45000 });
    await page.waitForTimeout(3000);
    const r = extract(await page.content());
    return { pin: r.pin ?? null, items: r.items };
  } catch { return null; } finally { await ctx.close().catch(() => undefined); }
}

// ---------------------------------------------------------------- HTTP sin navegador
// Facebook entrega el mismo HTML (con el JSON embebido) a un GET con cabeceras de
// Chrome: sin Chromium, ~1 s por página y casi sin memoria. Lo único que se pierde es
// el horario detallado (sale de un clic); queda el estado («Abierto ahora»).
const USE_BROWSER = process.env.FB_BROWSER === '1';
const HTTP_HEADERS = {
  'user-agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/141.0.0.0 Safari/537.36',
  accept: 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8',
  'accept-language': 'es-BO,es;q=0.9,en;q=0.5',
  'sec-fetch-mode': 'navigate',
  'sec-fetch-dest': 'document',
  'sec-fetch-site': 'none',
  'sec-fetch-user': '?1',
  'upgrade-insecure-requests': '1',
};
async function httpGet(url) {
  const ctl = new AbortController();
  const timer = setTimeout(() => ctl.abort(), 40_000);
  try {
    const resp = await fetch(url, { headers: HTTP_HEADERS, redirect: 'follow', signal: ctl.signal });
    return { status: resp.status, url: resp.url, html: await resp.text() };
  } finally { clearTimeout(timer); }
}
async function readPageHttp(cand) {
  const slugId = /-(\d{9,})$/.exec(cand.key)?.[1];
  const target = slugId ? `https://www.facebook.com/profile.php?id=${slugId}` : cand.url;
  const { status: httpStatus, url: finalUrl, html } = await httpGet(target);
  if (DEBUG_DIR) fs.writeFileSync(path.join(DEBUG_DIR, `${cand.key.replace(/[^\w.-]/g, '_')}.html`), html);
  if (/\/login|\/checkpoint|login\.php/.test(finalUrl) && !/og:title/.test(html)) return { status: 'BLOCKED', note: `redirigido a ${finalUrl.slice(0, 80)}`, finalUrl, httpStatus };
  if (httpStatus === 404) return { status: 'NOT_FOUND', note: 'HTTP 404', finalUrl, httpStatus };
  if (/Este contenido no está disponible|This content isn't available|Esta página no está disponible|This page isn't available/u.test(html) && !/delegate_page/.test(html)) {
    return { status: 'RESTRICTED', note: 'Facebook no muestra la página sin sesión', finalUrl, httpStatus };
  }
  if (httpStatus >= 400 || !/og:title|name="description"|delegate_page/.test(html)) return { status: 'BLOCKED', note: `HTTP ${httpStatus}, sin metadatos`, finalUrl, httpStatus };
  return { status: 'OK', html, extra: [], hoursText: null, finalUrl, httpStatus };
}
async function readAboutPinHttp(url) {
  const aboutUrl = url.includes('profile.php') ? `${url}&sk=about_contact_and_basic_info` : `${url.replace(/\/$/, '')}/about_contact_and_basic_info`;
  try {
    const { html } = await httpGet(aboutUrl);
    const r = extract(html);
    return { pin: r.pin ?? null, items: r.items };
  } catch { return null; }
}

// ---------------------------------------------------------------- bucle
// Un BLOCKED o ERROR se reintenta una vez más (en otra tanda); dos fallas lo cierran.
const previous = readNdjson(RESULTS);
const failures = new Map();
for (const x of previous) if (x.status === 'BLOCKED' || x.status === 'ERROR') failures.set(x.key, (failures.get(x.key) ?? 0) + 1);
const lastStatus = new Map(previous.map((x) => [x.key, x.status]));
const done = new Set([...lastStatus].filter(([k, s]) => !((s === 'BLOCKED' || s === 'ERROR') && (failures.get(k) ?? 0) < 2)).map(([k]) => k));
let blockedStreak = 0;
let processed = 0;
const counts = {};

async function handle(cand) {
  const retrievedAt = new Date().toISOString();
  let res;
  try { res = await (USE_BROWSER ? readPage(cand) : readPageHttp(cand)); } catch (e) { res = { status: 'ERROR', note: e.message.slice(0, 160) }; await browser?.close().catch(() => undefined); browser = null; }
  let line;
  if (res.status === 'OK') {
    try {
    const r = extract(res.html, res.extra);
    const isPage = Boolean(r.delegate) || r.items.some((i) => i.type === 'InfluencerCategoryContextItemRenderer' && /^(Página|Page)\b/.test(i.text ?? ''));
    if (!isPage) {
      line = { key: cand.key, status: 'SKIPPED_PERSONAL', retrieved_at: retrievedAt };
    } else {
      let aboutPin = null; let aboutItems = [];
      const hasAddr = r.items.some((i) => i.type === 'AddressContextItemRenderer');
      const hasCoords = r.items.some((i) => i.type === 'AddressContextItemRenderer' && coordsFromMapUrl(i.url));
      if ((hasAddr && !hasCoords) || (r.items.length === 0 && !r.place)) {
        const about = await (USE_BROWSER ? readAboutPin : readAboutPinHttp)(res.finalUrl ?? cand.url);
        aboutPin = about?.pin ?? null; aboutItems = about?.items ?? [];
        if (r.items.length === 0) r.items.push(...aboutItems);
      }
      const n = normalize(cand, r, res.hoursText, aboutPin);
      line = { key: cand.key, status: 'OK', retrieved_at: retrievedAt, profile_id: r.profile_id, page_id: r.delegate?.id ?? null, url: res.finalUrl?.split('?')[0].includes('profile.php') ? res.finalUrl : (res.finalUrl ?? cand.url).split('?')[0], data: n, cand: { query: cand.query, title: cand.title, found_url: cand.found_url } };
    }
    } catch (e) {
      line = { key: cand.key, status: 'ERROR', note: `extracción: ${e.message.slice(0, 120)}`, retrieved_at: retrievedAt, url: cand.url };
    }
  } else {
    line = { key: cand.key, status: res.status, note: res.note, retrieved_at: retrievedAt, http_status: res.httpStatus ?? null, url: cand.url, cand: { query: cand.query, title: cand.title, found_url: cand.found_url } };
  }
  fs.appendFileSync(RESULTS, JSON.stringify(line) + '\n');
  done.add(cand.key);
  counts[line.status] = (counts[line.status] ?? 0) + 1;
  processed += 1;
  blockedStreak = line.status === 'BLOCKED' || line.status === 'ERROR' ? blockedStreak + 1 : 0;
  const d = line.data;
  console.log(`${processed} ${line.status} ${cand.key}${d ? ` | ${d.name} | ${d.category_raw} | ${d.municipality ?? d.page_city ?? '-'} | ${d.lat ? 'geo' : '-'} | ${d.phone ? 'tel' : '-'} | ${d.hours ? 'hor' : '-'}` : ` ${line.note ?? ''}`}`);
}

async function worker(queue, wid) {
  while (true) {
    if (processed >= LIMIT || Date.now() > TANDA_END) return;
    const cand = queue.shift();
    if (!cand) return;
    if (done.has(cand.key)) continue;
    if (blockedStreak >= 4) {
      const wait = Math.min(120 * blockedStreak, 1800);
      console.log(`[w${wid}] ${blockedStreak} bloqueos seguidos: espero ${wait}s`);
      await browser?.close().catch(() => undefined); browser = null;
      await sleep(wait * 1000);
      blockedStreak = Math.max(0, blockedStreak - 2);
    }
    // La laptop es compartida con otros agentes: sin 800 MB libres no se sigue. Con
    // navegador se mira antes de cada página; por HTTP (sin Chromium) antes de cada lote de 40.
    while ((USE_BROWSER || processed % 40 === 0) && os.freemem() < MIN_FREE_MB * 1024 * 1024) {
      console.log(`[mem] libre ${Math.round(os.freemem() / 1048576)} MB: espero 60 s`);
      await browser?.close().catch(() => undefined); browser = null;
      await sleep(60_000);
    }
    await handle(cand);
    await pause(1.5, 4);
  }
}

while (true) {
  const pending = readNdjson(CANDIDATES).filter((c) => !done.has(c.key));
  // Primero lo que el título de Yahoo ya ubica en Santa Cruz.
  // Intercalado por lugar de la consulta: cada tanda toca muchos municipios y zonas.
  {
    const groups = new Map();
    for (const c of pending) { const g = c.lugar ?? '?'; if (!groups.has(g)) groups.set(g, []); groups.get(g).push(c); }
    const lists = [...groups.values()];
    pending.length = 0;
    for (let i = 0; lists.some((l) => l[i]); i += 1) for (const l of lists) if (l[i]) pending.push(l[i]);
  }
  if (pending.length) {
    console.log(`pendientes: ${pending.length}; hechos: ${done.size}; ${JSON.stringify(counts)}`);
    await Promise.all(Array.from({ length: CONCURRENCY }, (_, i) => worker(pending, i + 1)));
  }
  if (ONCE) break;
  if (fs.existsSync(DONE_FLAG) && !readNdjson(CANDIDATES).some((c) => !done.has(c.key))) break;
  await sleep(60_000);
}
await browser?.close().catch(() => undefined);
console.log(`fin: ${processed} leídas ${JSON.stringify(counts)}`);
