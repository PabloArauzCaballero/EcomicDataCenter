// Comprueba la entrega publicada: sólo filas OK, sin correos y sin números de 7+ dígitos
// fuera de `phone` (y de los identificadores, las coordenadas y las URL de la propia página).
import fs from 'node:fs';
import path from 'node:path';
import zlib from 'node:zlib';
import { HERE } from './common.mjs';

const rows = zlib.gunzipSync(fs.readFileSync(path.join(HERE, '..', 'facebook-resto.ndjson.gz'))).toString('utf8').trim().split('\n').map(JSON.parse);
const problems = [];
const SKIP_KEYS = new Set(['phone', 'source_id', 'page_id', 'profile_id', 'lat', 'lon', 'source_url', 'html_sha256', 'osm', 'retrieved_at', 'source_updated_at', 'last_post_at', 'at']);
function check(v, where, id) {
  if (typeof v === 'string') {
    if (/[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Za-z]{2,}/.test(v)) problems.push(`${id} correo en ${where}`);
    const digits = v.match(/(?:\+?\d[\s().-]{0,3}){7,}/g)?.filter((m) => m.replace(/\D/g, '').length >= 7);
    const real = digits?.filter((m) => !/^\s*(?:19|20)\d\d\s*[-–/]\s*(?:19|20)\d\d\s*$/.test(m));
    if (real?.length && !/^https?:\/\//.test(v)) problems.push(`${id} número en ${where}: ${real[0]}`);
    if (/wa\.me|whatsapp\.com/i.test(v)) problems.push(`${id} whatsapp en ${where}`);
  } else if (Array.isArray(v)) v.forEach((x, i) => check(x, `${where}[${i}]`, id));
  else if (v && typeof v === 'object') for (const [k, x] of Object.entries(v)) if (!SKIP_KEYS.has(k)) check(x, `${where}.${k}`, id);
}
for (const r of rows) {
  if (r.status !== 'OK') problems.push(`${r.source_id} estado ${r.status}`);
  for (const [k, v] of Object.entries(r)) if (!SKIP_KEYS.has(k)) check(v, k, r.source_id);
}
console.log(`${rows.length} filas; ${problems.length} problemas`);
for (const p of problems.slice(0, 30)) console.log(' ', p);
process.exitCode = problems.length ? 1 : 0;
