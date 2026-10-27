// Verificador independiente de la entrega publicada. No reutiliza las expresiones del
// limpiador (privacy.mjs) para no compartir sus puntos ciegos:
//
// - Teléfonos: el texto (NFKC) se corta en ventanas sin letras —cualquier tramo entre dos
//   letras, de cualquier alfabeto—; de cada ventana se quita todo lo que no sea dígito y se
//   marca si quedan 7 o más. Además, una ventana deslizante de 24 caracteres sobre el texto
//   entero marca cualquier tramo con 7+ dígitos y a lo sumo 2 letras (dígitos con «o»/«l»
//   colados, «tel7 7 7…»).
// - Correos: «@», «arroba», «(at)» o «[at]» seguidos de algo con punto o «punto».
// - Sólo filas OK; ningún enlace de WhatsApp.
//
// Quedan fuera sólo `phone` de la página confirmada y los campos de sistema (ids, coordenadas,
// fechas, sha, URL canónica de la página y el objeto `osm`).
import fs from 'node:fs';
import path from 'node:path';
import zlib from 'node:zlib';
import { HERE } from './common.mjs';

const rows = zlib.gunzipSync(fs.readFileSync(path.join(HERE, '..', 'facebook-resto.ndjson.gz'))).toString('utf8').trim().split('\n').map(JSON.parse);
const SYSTEM = new Set(['phone', 'source_id', 'page_id', 'profile_id', 'lat', 'lon', 'source_url', 'html_sha256', 'osm',
  'retrieved_at', 'source_updated_at', 'last_post_at', 'followers', 'likes', 'talking_about', 'were_here', 'http_status',
  'location_distance_km', 'posts_seen']);

function digitWindows(s) {
  const hits = [];
  for (const win of s.split(/\p{L}+/u)) {
    const digits = win.replace(/\D/gu, '').replace(/[^\p{Nd}]/gu, '');
    const all = [...win].filter((c) => /\p{Nd}/u.test(c)).length;
    if (Math.max(digits.length, all) >= 7) hits.push(win.trim().slice(0, 30));
  }
  const chars = [...s];
  for (let i = 0; i < chars.length; i += 1) {
    const w = chars.slice(i, i + 24);
    const d = w.filter((c) => /\p{Nd}/u.test(c)).length;
    const l = w.filter((c) => /\p{L}/u.test(c)).length;
    if (d >= 7 && l <= 2) { hits.push(w.join('').trim()); break; }
  }
  return hits;
}

const problems = [];
const counts = { rows: rows.length, strings: 0, phone_hits: 0, email_hits: 0, whatsapp_hits: 0, not_ok: 0 };
function check(v, where, id) {
  if (typeof v === 'string') {
    counts.strings += 1;
    const s = v.normalize('NFKC');
    for (const h of digitWindows(s)) { counts.phone_hits += 1; problems.push(`${id} dígitos en ${where}: «${h}»`); }
    if (/(@|\barroba\b|[([]\s*at\s*[)\]])\s*\S+?(\.|\bpunto\b)\s*\S/iu.test(s)) { counts.email_hits += 1; problems.push(`${id} correo en ${where}`); }
    if (/wa\.me|whatsapp\.com/iu.test(s)) { counts.whatsapp_hits += 1; problems.push(`${id} whatsapp en ${where}`); }
  } else if (Array.isArray(v)) v.forEach((x, i) => check(x, `${where}[${i}]`, id));
  else if (v && typeof v === 'object') for (const [k, x] of Object.entries(v)) if (!SYSTEM.has(k)) check(x, `${where}.${k}`, id);
}
for (const r of rows) {
  if (r.status !== 'OK') { counts.not_ok += 1; problems.push(`${r.source_id} estado ${r.status}`); }
  for (const [k, v] of Object.entries(r)) if (!SYSTEM.has(k)) check(v, k, r.source_id);
}
console.log(JSON.stringify(counts));
console.log(`${problems.length} hallazgos`);
for (const p of problems.slice(0, 40)) console.log(' ', p);
process.exitCode = problems.length ? 1 : 0;
