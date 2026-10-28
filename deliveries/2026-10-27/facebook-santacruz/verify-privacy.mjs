/**
 * Verificador de privacidad independiente del limpiador de package.mjs (no comparte
 * código con él). Recorre cada valor de texto de los archivos publicados y marca:
 *
 * - cualquier tramo con 7 o más dígitos (\p{Nd}, tras NFKC) una vez quitado todo lo
 *   que no es dígito dentro del tramo (separadores: espacios, puntos, guiones —también
 *   Unicode—, «/», «·», paréntesis, «+», comas);
 * - cualquier correo: «@», «(arroba)», «[arroba]», «arroba».
 *
 * Exentos (estructurales, no texto libre): `phone` de la página confirmada, los
 * identificadores de la página (`source_id`, `raw.page_id`, `raw.profile_id`,
 * `raw.vanity_or_key` cuando es numérico) y `source_url` sólo si es la URL de la página
 * y el número que lleva es uno de esos identificadores; las marcas de tiempo ISO
 * (`retrieved_at`, `last_post_at`, `source_updated_at`) sólo si tienen forma ISO.
 * Además exige que no haya filas con status distinto de OK.
 *
 * Uso: node verify-privacy.mjs  → sale con código 1 si hay un solo hallazgo.
 */
import fs from 'node:fs';
import path from 'node:path';
import zlib from 'node:zlib';
import { fileURLToPath } from 'node:url';

const HERE = path.dirname(fileURLToPath(import.meta.url));
const FILES = ['facebook-santacruz.ndjson.gz', 'facebook-santacruz-fuera-del-departamento.ndjson.gz'];
const RUN = /\p{Nd}(?:[\s.,\-‐-―−﹘﹣－/·()+]*\p{Nd})*/gu;
const MAIL = /(@|\(\s*arroba\s*\)|\[\s*arroba\s*\]|\barroba\b)/iu;
const ISO = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(\.\d+)?Z$/;

function findings(text) {
  const t = text.normalize('NFKC');
  const out = [];
  for (const m of t.matchAll(RUN)) if (m[0].replace(/[^\p{Nd}]/gu, '').length >= 7) out.push(`dígitos:${m[0]}`);
  if (MAIL.test(t)) out.push('correo');
  return out;
}

let total = 0; let rows = 0;
const problems = [];
for (const file of FILES) {
  const p = path.join(HERE, file);
  if (!fs.existsSync(p)) continue;
  const lines = zlib.gunzipSync(fs.readFileSync(p)).toString('utf8').split('\n').filter(Boolean);
  for (const line of lines) {
    rows += 1;
    const rec = JSON.parse(line);
    if (rec.status !== 'OK') problems.push({ file, id: rec.source_id, field: 'status', what: rec.status });
    const ids = new Set([rec.source_id, rec.raw?.page_id, rec.raw?.profile_id].filter(Boolean).map(String));
    const visit = (v, at) => {
      if (typeof v === 'string') {
        if (at === 'phone') return;
        if (['source_id', 'raw.page_id', 'raw.profile_id'].includes(at) && /^\d+$/.test(v)) return;
        if (at === 'raw.vanity_or_key' && (ids.has(v) || !/^\d+$/.test(v))) { if (!/^\d+$/.test(v)) { for (const f of findings(v)) problems.push({ file, id: rec.source_id, field: at, what: f }); } return; }
        if (['retrieved_at', 'last_post_at', 'source_updated_at'].includes(at) && ISO.test(v)) return;
        if (at === 'source_url') {
          const nums = v.match(/\d{7,}/g) ?? [];
          if (/^https:\/\/www\.facebook\.com\//.test(v) && nums.every((n) => ids.has(n))) {
            const rest = v.replace(/\d{7,}/g, '');
            for (const f of findings(rest)) problems.push({ file, id: rec.source_id, field: at, what: f });
            return;
          }
        }
        for (const f of findings(v)) problems.push({ file, id: rec.source_id, field: at, what: f });
        return;
      }
      if (Array.isArray(v)) { v.forEach((x, i) => visit(x, `${at}[${i}]`)); return; }
      if (v && typeof v === 'object') for (const [k, x] of Object.entries(v)) visit(x, at ? `${at}.${k}` : k);
    };
    visit(rec, '');
    total += 1;
  }
}
console.log(JSON.stringify({ rows, findings: problems.length, sample: problems.slice(0, 20) }, null, 2));
process.exit(problems.length ? 1 : 0);
