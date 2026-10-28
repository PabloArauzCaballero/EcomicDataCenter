/**
 * Descubrimiento de páginas de negocios de Facebook en el departamento de Santa Cruz.
 *
 * Buscador: Yahoo (search.yahoo.com). El 27-oct-2026, desde esta red, Bing devolvía
 * resultados envenenados (letras de canciones para «churrasquería Santa Cruz»),
 * Google, Brave, Mojeek, Startpage, Yandex y DuckDuckGo respondían con un desafío.
 * Yahoo sí respeta `site:facebook.com` y entrega los enlaces directos.
 *
 * Una consulta a la vez, en un contexto de navegador limpio por consulta, con pausa
 * al azar. Reanuda: las consultas hechas quedan en work/queries.ndjson y los
 * candidatos en work/candidates.ndjson (una línea por URL nueva).
 *
 * Uso: node discover.mjs [maxConsultas]
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
fs.mkdirSync(WORK, { recursive: true });
const QUERIES = path.join(WORK, 'queries.ndjson');
const CANDIDATES = path.join(WORK, 'candidates.ndjson');
const DONE_FLAG = path.join(WORK, 'discover.done');

// ---------------------------------------------------------------- rubros y lugares
const RUBROS_CORE = [
  'restaurante', 'churrasquería', 'pollería', 'heladería', 'cafetería', 'panadería', 'farmacia',
  'ferretería', 'agroveterinaria', 'maquinaria agrícola', 'tienda de ropa', 'peluquería', 'gimnasio',
  'clínica', 'consultorio médico', 'taller mecánico', 'repuestos', 'hotel', 'librería', 'celulares',
  'supermercado', 'mueblería', 'colegio privado', 'instituto', 'inmobiliaria', 'distribuidora',
  'importadora', 'constructora', 'veterinaria', 'odontología', 'pizzería', 'hamburguesas',
  'materiales de construcción', 'electrodomésticos', 'salón de belleza', 'barbería', 'óptica',
  'laboratorio clínico', 'zapatería', 'lubricentro',
];
const RUBROS_EXTRA = [
  'pastelería', 'salteñería', 'comida rápida', 'sushi', 'comida china', 'cevichería', 'parrillada',
  'café', 'juguería', 'boutique', 'lencería', 'ropa de bebé', 'uniformes', 'joyería', 'relojería',
  'perfumería', 'cosméticos', 'spa', 'centro de estética', 'uñas', 'tatuajes', 'crossfit', 'academia de baile',
  'consultorio dental', 'fisioterapia', 'psicólogo', 'ginecología', 'pediatría', 'hospital',
  'llantería', 'autolavado', 'concesionario de autos', 'motos', 'rent a car', 'grúas', 'chapería y pintura',
  'hostal', 'alojamiento', 'agencia de viajes', 'papelería', 'imprenta', 'fotocopias', 'computadoras',
  'tecnología', 'cámaras de seguridad', 'minimarket', 'frial', 'carnicería', 'avícola', 'productos lácteos',
  'tienda naturista', 'colchones', 'cortinas', 'vidriería', 'carpintería', 'aluminio', 'pinturas',
  'herrería', 'plomería', 'electricidad', 'aire acondicionado', 'paneles solares', 'cerrajería',
  'kinder', 'guardería', 'universidad', 'academia de inglés', 'escuela de conducir', 'preuniversitario',
  'estudio jurídico', 'abogados', 'contadores', 'agencia de publicidad', 'diseño gráfico', 'courier',
  'transporte de carga', 'mudanzas', 'lavandería', 'floristería', 'eventos', 'salón de eventos', 'catering',
  'cotillón', 'bazar', 'tienda de mascotas', 'pet shop', 'semillas', 'agroquímicos', 'fertilizantes',
  'tractores', 'silos', 'ganadería', 'balanceados', 'tienda deportiva', 'bicicletas', 'fotografía',
  'textiles', 'telas', 'mayorista', 'tienda de regalos', 'variedades', 'repostería', 'pensión',
  'karaoke', 'discoteca', 'bar', 'licorería', 'gas', 'agua purificada', 'hielo', 'empresa de seguridad',
  'limpieza', 'fumigación', 'piscinas', 'cerámicas', 'sanitarios', 'cemento', 'ladrillos', 'áridos',
  'acopio de granos', 'aserradero', 'madera', 'clínica veterinaria', 'tienda de celulares',
];

const SCZ_CITY = 'Santa Cruz de la Sierra';
const ZONAS = [
  'Equipetrol', 'Urbarí', 'Las Palmas', 'Plan 3000', 'Villa 1ro de Mayo', 'Pampa de la Isla', 'Los Lotes',
  'Zona Norte', 'segundo anillo', 'tercer anillo', 'cuarto anillo', 'quinto anillo', 'sexto anillo',
  'séptimo anillo', 'octavo anillo', 'Doble Vía La Guardia', 'Av. Banzer', 'Av. Alemana', 'Av. Beni',
  'Av. Santos Dumont', 'Av. Piraí', 'Av. Grigotá', 'Av. Mutualista', 'Av. Paraguá', 'Radial 26',
  'Los Pozos', 'Siete Calles', 'Abasto', 'La Ramada', 'Sirari', 'Urubó', 'El Trompillo', 'Palmasola',
  'Barrio Hamacas', 'Casco Viejo', 'Av. Virgen de Cotoca', 'Av. Cristo Redentor', 'Av. Roca y Coronado',
  'Av. Brasil', 'Mercado Mutualista', 'Satélite Norte', 'Av. Busch', 'Barrio Lindo', 'El Bajío',
  'Villa Primero de Mayo', 'Plan Tres Mil', 'Av. Santa Cruz', 'Av. Paurito', 'Km 9', 'Normandía',
];
const MUNI_MAIN = [
  'Montero', 'Warnes', 'La Guardia', 'Cotoca', 'El Torno', 'Camiri', 'San Ignacio de Velasco',
  'Puerto Quijarro', 'Puerto Suárez', 'Yapacaní', 'Mineros', 'San Julián', 'Pailón', 'Vallegrande',
  'Samaipata', 'Roboré', 'San José de Chiquitos', 'Concepción', 'Ascensión de Guarayos', 'Portachuelo',
  'Buena Vista', 'Comarapa', 'Cuatro Cañadas', 'Porongo',
];
const MUNI_SMALL = [
  'Okinawa', 'Saavedra', 'Fernández Alonso', 'San Pedro', 'Santa Rosa del Sara', 'Colpa Bélgica',
  'San Carlos', 'San Juan de Yapacaní', 'Urubichá', 'El Puente', 'San Javier', 'San Ramón',
  'San Antonio de Lomerío', 'San Miguel de Velasco', 'San Rafael de Velasco', 'Carmen Rivero Tórrez',
  'San Matías', 'Lagunillas', 'Charagua', 'Cabezas', 'Cuevo', 'Gutiérrez', 'Boyuibe', 'Trigal', 'Moro Moro',
  'Postrervalle', 'Pucará', 'Pampa Grande', 'Mairana', 'Quirusillas', 'Saipina', 'Puerto Pailas',
  'Paurito', 'Abapó', 'Limoncito', 'Pailas', 'Puerto Busch', 'Tres Cruces', 'Guarayos',
];
const RUBROS_SMALL = [
  'restaurante', 'hotel', 'farmacia', 'ferretería', 'tienda', 'agroveterinaria', 'panadería',
  'alojamiento', 'clínica', 'supermercado', 'repuestos', 'distribuidora',
];

function buildQueries() {
  const q = [];
  const add = (rubro, lugar, tier) => q.push({ tier, rubro, lugar, text: `site:facebook.com ${rubro} ${lugar} Bolivia` });
  for (const r of RUBROS_CORE) add(r, SCZ_CITY, 'A');
  for (const r of RUBROS_EXTRA) add(r, SCZ_CITY, 'A');
  for (const m of MUNI_MAIN.slice(0, 12)) for (const r of RUBROS_CORE) add(r, m, 'B');
  for (const m of MUNI_SMALL) for (const r of RUBROS_SMALL) add(r, `${m} Santa Cruz`, 'C');
  for (const m of MUNI_MAIN.slice(12)) for (const r of RUBROS_CORE) add(r, m, 'D');
  for (const z of ZONAS) for (const r of RUBROS_CORE.slice(0, 20)) add(r, `${z} Santa Cruz`, 'E');
  for (const m of MUNI_MAIN.slice(0, 12)) for (const r of RUBROS_EXTRA) add(r, m, 'F');
  for (const z of ZONAS) for (const r of [...RUBROS_CORE.slice(20), ...RUBROS_EXTRA]) add(r, `${z} Santa Cruz`, 'G');
  const seen = new Set();
  const unique = q.filter((x) => (seen.has(x.text) ? false : (seen.add(x.text), true)));
  // Se intercalan los tramos: así, si el tiempo se acaba, la muestra cubre la ciudad,
  // los municipios grandes, los chicos y las zonas, y no sólo la capital.
  const byTier = new Map();
  for (const x of unique) { if (!byTier.has(x.tier)) byTier.set(x.tier, []); byTier.get(x.tier).push(x); }
  const lists = [...byTier.values()];
  const out = [];
  for (let i = 0; out.length < unique.length; i += 1) for (const l of lists) if (l[i]) out.push(l[i]);
  return out;
}

// ---------------------------------------------------------------- URLs de Facebook
const RESERVED = new Set([
  'groups', 'events', 'marketplace', 'watch', 'reel', 'reels', 'photo', 'photo.php', 'story.php',
  'permalink.php', 'sharer', 'sharer.php', 'hashtag', 'login', 'login.php', 'help', 'policies', 'legal',
  'privacy', 'business', 'gaming', 'live', 'stories', 'media', 'video.php', 'videos', 'share', 'l.php',
  'dialog', 'plugins', 'public', 'search', 'notes', 'messages', 'friends', 'home.php', 'ads', 'fundraisers',
  'pg', 'places', 'directory', 'careers', 'about', 'settings', 'bookmarks', 'jobs', 'offers', 'help.php',
  'recover', 'r.php', 'reg', 'campaign', 'commerce', 'shops', 'tr', 'flx', 'ajax',
]);

/** La clave estable de una página a partir de cualquier enlace a ella, o null si no es una página. */
export function pageKey(raw) {
  let u;
  try { u = new URL(raw); } catch { return null; }
  if (!/(^|\.)facebook\.com$/i.test(u.hostname)) return null;
  const parts = u.pathname.split('/').filter(Boolean).map((p) => { try { return decodeURIComponent(p); } catch { return p; } });
  if (/^\/?profile\.php/i.test(u.pathname)) {
    const id = u.searchParams.get('id');
    return id && /^\d+$/.test(id) ? { key: id, url: `https://www.facebook.com/profile.php?id=${id}` } : null;
  }
  if (!parts.length) return null;
  const head = parts[0];
  if (head === 'people' && parts[2] && /^\d+$/.test(parts[2])) return { key: parts[2], url: `https://www.facebook.com/profile.php?id=${parts[2]}` };
  if (head === 'p' && parts[1]) {
    const id = /-(\d{6,})$/.exec(parts[1])?.[1];
    return id ? { key: id, url: `https://www.facebook.com/profile.php?id=${id}` } : null;
  }
  if (head === 'pages' && parts.length >= 3) {
    if (parts[1] === 'category') return null;
    const id = parts.find((p) => /^\d{6,}$/.test(p));
    return id ? { key: id, url: `https://www.facebook.com/${id}` } : null;
  }
  if (/^\d{6,}$/.test(head)) return { key: head, url: `https://www.facebook.com/profile.php?id=${head}` };
  // «Nombre-de-la-pagina-103516625381548»: el número final es el id de la página.
  const slugId = /-(\d{9,})$/.exec(head)?.[1];
  if (slugId) return { key: slugId, url: `https://www.facebook.com/profile.php?id=${slugId}` };
  if (RESERVED.has(head.toLowerCase())) return null;
  if (!/^[A-Za-z0-9.\-_]{3,}$/.test(head) && !/^[\p{L}\p{N}.\-_]{3,}$/u.test(head)) return null;
  return { key: head.toLowerCase(), url: `https://www.facebook.com/${encodeURIComponent(head)}/` };
}

// ---------------------------------------------------------------- estado
function readNdjson(file) {
  if (!fs.existsSync(file)) return [];
  return fs.readFileSync(file, 'utf8').split('\n').filter(Boolean).map((l) => { try { return JSON.parse(l); } catch { return null; } }).filter(Boolean);
}
const readCache = new Map(readNdjson(QUERIES).map((x) => [x.id, x.fresh]));
const doneQueries = new Set(readCache.keys());
const knownKeys = new Set(readNdjson(CANDIDATES).map((x) => x.key));

// ---------------------------------------------------------------- navegador
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const pause = (a, b) => sleep((a + Math.random() * (b - a)) * 1000);

let browser = null;
async function getBrowser() {
  if (browser?.isConnected()) return browser;
  browser = await chromium.launch({ headless: true, args: ['--disable-blink-features=AutomationControlled'] });
  return browser;
}
async function yahoo(text, offset) {
  const b = await getBrowser();
  const major = b.version().split('.')[0];
  const ctx = await b.newContext({
    locale: 'es-BO', timezoneId: 'America/La_Paz', viewport: { width: 1366, height: 900 },
    userAgent: `Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/${major}.0.0.0 Safari/537.36`,
  });
  try {
    const page = await ctx.newPage();
    await page.route('**/*', (route) => (['image', 'font', 'media'].includes(route.request().resourceType()) ? route.abort() : route.continue()));
    const url = `https://search.yahoo.com/search?p=${encodeURIComponent(text)}${offset > 1 ? `&b=${offset}` : ''}`;
    await page.goto(url, { waitUntil: 'domcontentloaded', timeout: 30000 });
    await page.waitForTimeout(1200);
    const items = await page.$$eval('#web ol li', (lis) => lis.map((li) => ({
      href: li.querySelector('h3 a, a')?.getAttribute('href') ?? '',
      title: li.querySelector('h3')?.innerText ?? '',
      snippet: li.querySelector('.compText, p')?.innerText ?? '',
    })));
    const body = items.length ? '' : (await page.innerText('body').catch(() => '')).slice(0, 300);
    return { items, body };
  } finally {
    await ctx.close().catch(() => undefined);
  }
}
function unwrap(href) {
  const ru = /\/RU=([^/]+)\//.exec(href)?.[1];
  if (ru) { try { return decodeURIComponent(ru); } catch { return href; } }
  return href;
}

// ---------------------------------------------------------------- bucle
const all = buildQueries();
const max = Number(process.argv[2] ?? Infinity);
let ran = 0;
let emptyStreak = 0;
console.log(`consultas: ${all.length}, hechas: ${doneQueries.size}, candidatos: ${knownKeys.size}`);
for (const q of all) {
  if (ran >= max) break;
  for (const offset of [1, 8, 15]) {
    const id = `${q.text}#${offset}`;
    if (doneQueries.has(id)) {
      // Página ya hecha: seguir sólo si la registrada trajo bastantes nuevos.
      const prev = readCache.get(id);
      if (prev !== undefined && prev < 3) break;
      continue;
    }
    while (os.freemem() < 800 * 1024 * 1024) {
      console.log(`[mem] libre ${Math.round(os.freemem() / 1048576)} MB: espero 60 s`);
      await browser?.close().catch(() => undefined); browser = null;
      await sleep(60_000);
    }
    let res;
    try {
      res = await yahoo(q.text, offset);
    } catch (e) {
      console.log(`! ${id}: ${e.message.slice(0, 120)}`);
      await browser?.close().catch(() => undefined); browser = null;
      await pause(20, 40);
      break;
    }
    ran += 1;
    let fbLinks = 0; let fresh = 0;
    for (const it of res.items) {
      const target = unwrap(it.href);
      const pk = pageKey(target);
      if (!pk) continue;
      fbLinks += 1;
      if (knownKeys.has(pk.key)) continue;
      knownKeys.add(pk.key); fresh += 1;
      fs.appendFileSync(CANDIDATES, JSON.stringify({ key: pk.key, url: pk.url, found_url: target, title: it.title, snippet: it.snippet.slice(0, 400), query: q.text, tier: q.tier, rubro: q.rubro, lugar: q.lugar, at: new Date().toISOString() }) + '\n');
    }
    fs.appendFileSync(QUERIES, JSON.stringify({ id, results: res.items.length, fb: fbLinks, fresh, at: new Date().toISOString() }) + '\n');
    doneQueries.add(id); readCache.set(id, fresh);
    console.log(`${q.tier} ${id} → ${res.items.length} res, ${fbLinks} fb, ${fresh} nuevos (total ${knownKeys.size})${res.body ? ' BODY:' + res.body.replace(/\s+/g, ' ').slice(0, 120) : ''}`);
    if (res.items.length === 0) {
      emptyStreak += 1;
      if (emptyStreak >= 3) {
        const wait = Math.min(60 * emptyStreak, 900);
        console.log(`  ${emptyStreak} vacías seguidas: espero ${wait}s y reinicio el navegador`);
        await browser?.close().catch(() => undefined); browser = null;
        await sleep(wait * 1000);
      }
    } else emptyStreak = 0;
    await pause(2, 5);
    if (fresh < 3) break;
  }
}
await browser?.close().catch(() => undefined);
if (ran < max) fs.writeFileSync(DONE_FLAG, new Date().toISOString());
console.log(`fin: ${ran} consultas, ${knownKeys.size} candidatos`);
