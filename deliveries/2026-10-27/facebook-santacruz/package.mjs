/**
 * Empaqueta work/results.ndjson en el formato común de entrega (NDJSON + gzip),
 * deduplica por id de página, aplica las reglas de privacidad y escribe
 * manifest.json (sha256 y conteos) y rejected-summary.json (sólo conteos).
 *
 * - facebook-santacruz.ndjson.gz: páginas de negocio confirmadas del departamento de
 *   Santa Cruz, más las confirmadas que no declaran ubicación (department=null).
 * - facebook-santacruz-fuera-del-departamento.ndjson.gz: páginas confirmadas que
 *   aparecieron en las búsquedas de Santa Cruz pero están en otro departamento o país.
 *
 * Privacidad (reglas del coordinador, 27-oct):
 * 1. Lo no confirmado como página de negocio (NOT_FOUND, RESTRICTED, BLOCKED) no se
 *    publica: sólo cuenta en rejected-summary.json por estado y ciudad.
 * 2. Correos y teléfonos se borran de todo texto libre; el único teléfono publicado es
 *    el campo `phone` (y `whatsapp`) de la página de empresa confirmada.
 * 3. Una página que parece de una persona (categoría de persona o nombre propio) se excluye.
 *
 * Uso: node package.mjs
 */
import fs from 'node:fs';
import path from 'node:path';
import zlib from 'node:zlib';
import crypto from 'node:crypto';
import { fileURLToPath } from 'node:url';

const HERE = path.dirname(fileURLToPath(import.meta.url));
const WORK = path.join(HERE, 'work');
const read = (f) => (fs.existsSync(f) ? fs.readFileSync(f, 'utf8').split('\n').filter(Boolean).map((l) => { try { return JSON.parse(l); } catch { return null; } }).filter(Boolean) : []);

const results = read(path.join(WORK, 'results.ndjson'));
const candidates = new Map(read(path.join(WORK, 'candidates.ndjson')).map((c) => [c.key, c]));
const queries = read(path.join(WORK, 'queries.ndjson'));

// La última lectura de cada clave manda (una reanudación puede repetir una clave).
const byKey = new Map();
for (const r of results) byKey.set(r.key, r);

const cityFromTitle = (t) => {
  const parts = (t ?? '').replace(/\s*-\s*Facebook\s*$/i, '').split(' | ');
  return parts.length > 1 ? parts.slice(1).join(' | ').trim() || '(sin ciudad)' : '(sin ciudad)';
};

// ---------------------------------------------------------------- privacidad
// Todo texto se normaliza con NFKC antes de buscar (dígitos de ancho completo, etc.).
// Correo: «@», «(arroba)», «[arroba]» o «arroba», y «.», «(punto)», «[punto]» o «punto».
const AT = String.raw`(?:@|\(\s*arroba\s*\)|\[\s*arroba\s*\]|\barroba\b)`;
const DOT = String.raw`(?:\.|\(\s*punto\s*\)|\[\s*punto\s*\]|\bpunto\b)`;
const EMAIL_RE = new RegExp(String.raw`[\p{L}\p{N}._%+-]+\s*${AT}\s*[\p{L}\p{N}-]+(?:\s*${DOT}\s*[\p{L}\p{N}-]+)+`, 'giu');
// Teléfono: un tramo de dígitos (\p{Nd}) unido por espacios, puntos, guiones (también
// los Unicode), «/», «·», paréntesis o «+», que tenga 7 o más dígitos.
const SEP = String.raw`[\s.,\-‐-―−﹘﹣－/·()+]`;
const DIGIT_RUN_RE = new RegExp(String.raw`\+?\p{Nd}(?:${SEP}*\p{Nd})*`, 'gu');
const digitCount = (s) => s.replace(/[^\p{Nd}]/gu, '').length;
function scrub(text) {
  if (typeof text !== 'string') return text;
  return text
    .normalize('NFKC')
    .replace(EMAIL_RE, '[correo]')
    .replace(DIGIT_RUN_RE, (m) => (digitCount(m) >= 7 ? '[teléfono]' : m));
}
function scrubDeep(v) {
  if (typeof v === 'string') return scrub(v);
  if (Array.isArray(v)) return v.map((x) => scrubDeep(x));
  if (v && typeof v === 'object') return Object.fromEntries(Object.entries(v).map(([k, x]) => [k, scrubDeep(x)]));
  return v;
}
const flagged = (s) => typeof s === 'string' && (scrub(s) !== s.normalize('NFKC'));

const PERSON_CATEGORY = /^(persona|personaje p[uú]blico|figura p[uú]blica|creador digital|creador de contenido|creador de videos|blogger|bloguero|artista|m[uú]sico|cantante|actor|actriz|modelo|atleta|deportista|pol[ií]tico|candidato|funcionario p[uú]blico|periodista|escritor|autor|presentador|comediante|influencer|gamer|creador de videojuegos|personaje ficticio|dj|bailar[ií]n|cuenta personal|sitio web personal|blog personal)\b/iu;
const PERSON_CATEGORY_EN = /^(person|public figure|digital creator|video creator|gaming video creator|blogger|personal blog|artist|musician|musician\/band|actor|athlete|politician|journalist|writer|author|comedian|entertainer|creator|fictional character|dj|dancer|personal website|news personality|model)$/i;
const TITLED_NAME = /^(dr|dra|lic|ing|abg|arq|msc|mgr|prof|psic|odont|nutr)\.?\s+\p{Lu}/u;
const PROFESSIONAL_CAT = /(m[eé]dic|doctor|dentista|odont[oó]log|abogad|psic[oó]log|nutricionista|entrenador|fot[oó]graf|maquillador|arquitect|contador|ginec|pediatra|cirujan|fisioterapeut|dermat|oftalm|cardi[oó]log|traumat|urolog|kinesi|terapeuta|coach|consultor|agente inmobiliario|profesional)/i;
const BUSINESS_WORD = /(cl[ií]nica|consultorio|centro|estudio|instituto|hospital|policl|laborator|farmacia|gabinete|spa|gym|gimnasio|academia|escuela|colegio|tienda|store|shop|srl|ltda|s\.a\.|group|grupo|servicios|inmobiliaria|bienes ra[ií]ces|asociados|bolivia|santa cruz|scz|dental|m[eé]dica|salud|vet|studio|fit|club|market|bar|caf[eé]|restaurant|hotel)/i;
function looksLikePerson(d) {
  const cat = (d.category_raw ?? '').trim();
  const catEn = (d.category_fb_en ?? '').trim();
  if (PERSON_CATEGORY.test(cat) || PERSON_CATEGORY_EN.test(catEn)) return 'categoria_de_persona';
  const name = (d.name ?? '').trim();
  if (TITLED_NAME.test(name)) return 'nombre_propio';
  // Profesional independiente con nombre y apellido, sin palabra de negocio en el nombre.
  const words = name.split(/\s+/).filter(Boolean);
  const properName = words.length >= 2 && words.length <= 4 && words.every((w) => /^\p{Lu}[\p{Ll}'-]+$/u.test(w));
  if (properName && PROFESSIONAL_CAT.test(`${cat} ${catEn}`) && !BUSINESS_WORD.test(name)) return 'nombre_propio';
  return null;
}

// ---------------------------------------------------------------- registros
const records = new Map();
const removed = {
  perfil_personal_detectado_al_leer: 0,
  no_confirmada_NOT_FOUND: 0,
  no_confirmada_RESTRICTED: 0,
  no_confirmada_BLOCKED: 0,
  categoria_de_persona: 0,
  nombre_propio: 0,
  duplicado_misma_pagina: 0,
};
const rejectedByStatusCity = {};
let personal = 0;
let scrubbedRecords = 0;
for (const r of byKey.values()) {
  if (r.status === 'SKIPPED_PERSONAL') { personal += 1; removed.perfil_personal_detectado_al_leer += 1; continue; }
  const cand = candidates.get(r.key) ?? {};
  if (r.status !== 'OK') {
    if (r.status === 'ERROR') continue; // falla transitoria: se reintenta, no es un estado de la entrega
    const reason = `no_confirmada_${r.status}`;
    removed[reason] = (removed[reason] ?? 0) + 1;
    const city = cityFromTitle(cand.title);
    rejectedByStatusCity[r.status] ??= {};
    rejectedByStatusCity[r.status][city] = (rejectedByStatusCity[r.status][city] ?? 0) + 1;
    continue;
  }
  const d = r.data;
  const why = looksLikePerson(d);
  if (why) { removed[why] += 1; continue; }
  const sourceId = String(r.page_id ?? r.profile_id ?? r.key);
  if (records.has(sourceId)) { removed.duplicado_misma_pagina += 1; continue; }
  // Identificadores de la página: estructurales, no texto libre (exentos del verificador).
  const ids = { page_id: r.page_id, profile_id: r.profile_id, vanity_or_key: r.key };
  const freeText = {
    category_fb_en: d.category_fb_en,
    page_kind: d.page_kind ?? 'pagina',
    page_city: d.page_city,
    department_inferred_from: d.department_inferred_from,
    price_range: d.price_range,
    hours_status_at_read: d.hours_status_at_read,
    intro_items: d.intro_items,
    // Lista de permitidos: ni título ni extracto del buscador.
    discovery: { via: 'yahoo', query: cand.query ?? r.cand?.query ?? null, rubro: cand.rubro ?? null, city: cand.lugar ?? null },
  };
  // El WhatsApp de empresa va dentro de `phone`, el único campo donde se publica un teléfono.
  const wa = d.whatsapp ? `+${String(d.whatsapp).replace(/^\+/, '')}` : null;
  const waSame = Boolean(wa && d.phone && wa.replace(/\D/g, '').endsWith(d.phone.replace(/\D/g, '')));
  const phone = [d.phone, wa && !waSame ? `WhatsApp ${wa}` : null].filter(Boolean).join(' · ') || null;
  const website = flagged(d.website) ? null : d.website;
  const rec = {
    source: 'facebook',
    source_id: sourceId,
    name: scrub(d.name),
    category_raw: scrub(d.category_raw),
    address: scrub(d.address),
    locality: scrub(d.locality),
    municipality: d.municipality,
    department: d.department,
    lat: d.lat,
    lon: d.lon,
    phone,
    website,
    // Sólo un horario semanal cuenta como horario; el estado del momento va a raw.
    hours: d.hours && /Lunes|Martes|Miércoles|Jueves|Viernes|Sábado|Domingo|Siempre abierto/i.test(d.hours) ? scrub(d.hours) : null,
    source_updated_at: d.last_post_at,
    source_url: r.url,
    retrieved_at: r.retrieved_at,
    followers: d.followers,
    last_post_at: d.last_post_at,
    status: 'OK',
    raw: {
      ...ids,
      likes: d.likes,
      talking_about: d.talking_about,
      were_here: d.were_here,
      whatsapp_business: Boolean(wa),
      whatsapp_same_as_phone: waSame,
      website_removed_for_privacy: Boolean(d.website && !website),
      ...scrubDeep(freeText),
    },
  };
  if (JSON.stringify([rec.name, rec.category_raw, rec.address, rec.hours, rec.raw.intro_items, rec.raw.page_city]) !== JSON.stringify([d.name, d.category_raw, d.address, d.hours, d.intro_items, d.page_city])) scrubbedRecords += 1;
  records.set(sourceId, rec);
}

const inside = []; const outside = [];
for (const rec of records.values()) {
  if (rec.department && rec.department !== 'Santa Cruz') outside.push(rec); else inside.push(rec);
}

function sha(file) { return crypto.createHash('sha256').update(fs.readFileSync(path.join(HERE, file))).digest('hex'); }
function write(file, rows) {
  const body = rows.map((r) => JSON.stringify(r)).join('\n') + (rows.length ? '\n' : '');
  const gz = zlib.gzipSync(Buffer.from(body, 'utf8'), { level: 9 });
  fs.writeFileSync(path.join(HERE, file), gz);
  return { file, records: rows.length, bytes: gz.length, sha256: sha(file) };
}

const pct = (n, d) => (d ? Math.round((1000 * n) / d) / 10 : 0);
function stats(rows) {
  const scz = rows.filter((r) => r.department === 'Santa Cruz');
  const f = (pred) => ({ n: rows.filter(pred).length, pct: pct(rows.filter(pred).length, rows.length) });
  const year = new Date(Date.now() - 365 * 86400_000).toISOString();
  const byMuni = {};
  for (const r of scz) byMuni[r.municipality ?? '(sin municipio)'] = (byMuni[r.municipality ?? '(sin municipio)'] ?? 0) + 1;
  const byDept = {};
  for (const r of rows) byDept[r.department ?? '(sin departamento)'] = (byDept[r.department ?? '(sin departamento)'] ?? 0) + 1;
  const byCat = {};
  for (const r of rows) byCat[r.category_raw ?? '(sin categoría)'] = (byCat[r.category_raw ?? '(sin categoría)'] ?? 0) + 1;
  return {
    records: rows.length,
    department_santa_cruz: scz.length,
    department_unknown: rows.filter((r) => !r.department).length,
    with_latlon: f((r) => r.lat !== null),
    with_address: f((r) => Boolean(r.address)),
    with_phone: f((r) => Boolean(r.phone)),
    with_latlon_and_address: f((r) => r.lat !== null && Boolean(r.address)),
    with_latlon_address_phone: f((r) => r.lat !== null && Boolean(r.address) && Boolean(r.phone)),
    with_website: f((r) => Boolean(r.website)),
    with_whatsapp: f((r) => Boolean(r.raw.whatsapp_business)),
    with_full_hours: f((r) => Boolean(r.hours) && /Lunes|Domingo|Siempre/i.test(r.hours)),
    with_hours_any: f((r) => Boolean(r.hours)),
    with_followers: f((r) => r.followers !== null),
    with_last_post: f((r) => Boolean(r.last_post_at)),
    active_last_12_months: f((r) => Boolean(r.last_post_at) && r.last_post_at >= year),
    by_department: byDept,
    by_municipality: Object.fromEntries(Object.entries(byMuni).sort((a, b) => b[1] - a[1])),
    top_categories: Object.fromEntries(Object.entries(byCat).sort((a, b) => b[1] - a[1]).slice(0, 40)),
  };
}

const sortRows = (rows) => rows.sort((a, b) => a.source_id.localeCompare(b.source_id));
const files = [
  write('facebook-santacruz.ndjson.gz', sortRows(inside)),
  write('facebook-santacruz-fuera-del-departamento.ndjson.gz', sortRows(outside)),
];
fs.writeFileSync(path.join(HERE, 'rejected-summary.json'), JSON.stringify({
  note: 'Filas leídas y NO publicadas. Sólo conteos: sin nombres, títulos, extractos ni URLs. La ciudad es la que el buscador mostraba junto al título del resultado.',
  removed_by_reason: removed,
  not_confirmed_by_status_and_city: rejectedByStatusCity,
}, null, 2) + '\n');
files.push({ file: 'rejected-summary.json', sha256: sha('rejected-summary.json') });

const qDistinct = new Set(queries.map((q) => q.id.replace(/#\d+$/, ''))).size;
const manifest = {
  delivery: '2026-10-27/facebook-santacruz',
  source: 'facebook',
  generated_at: new Date().toISOString(),
  method: 'Yahoo site:facebook.com (descubrimiento) + Playwright/Chromium sin sesión (lectura de la página pública)',
  files,
  scripts: ['discover.mjs', 'fetch.mjs', 'run.mjs', 'package.mjs', 'verify-privacy.mjs'].map((f) => ({ file: f, sha256: sha(f) })),
  discovery: {
    distinct_queries: qDistinct,
    result_pages_read: queries.length,
    candidates: candidates.size,
    candidates_read: byKey.size,
    candidates_not_read_yet: [...candidates.keys()].filter((k) => !byKey.has(k)).length,
  },
  removed_by_reason: removed,
  records_with_free_text_scrubbed: scrubbedRecords,
  stats_main_file: stats(inside),
  stats_outside_file: stats(outside),
};
fs.writeFileSync(path.join(HERE, 'manifest.json'), JSON.stringify(manifest, null, 2) + '\n');
console.log(JSON.stringify({ files, discovery: manifest.discovery, removed, scrubbedRecords, main: { ...manifest.stats_main_file, by_municipality: undefined, top_categories: undefined } }, null, 2));
