/**
 * Arma la entrega de la Gaceta Electrónica de Comercio: NDJSON.gz con una fila por
 * publicación, deduplicada por `id`, más `gaceta-summary.json` y verificación de
 * privacidad.
 *
 * Solo datos de la empresa: matrícula, razón social, tipo de publicación (el
 * `titulo` del acto), fecha y enlace. No se guarda el `resumen` (nombra socios,
 * cédulas, teléfonos y correos) ni ningún campo que no esté en esa lista. La
 * razón social de una unipersonal puede ser el nombre del dueño: ya es pública en el
 * padrón y se conserva tal cual; si además contiene un correo, un teléfono o una
 * cédula, la fila se cuenta como «sospechosa» y se reporta.
 *
 *   node build-gaceta.mjs <out> <destino>
 */
import { readdirSync, readFileSync, writeFileSync, mkdirSync, existsSync } from 'node:fs';
import { gunzipSync, gzipSync } from 'node:zlib';
import { join } from 'node:path';
import { createHash } from 'node:crypto';
import { readdirSync as ls, statSync } from 'node:fs';

const [out, dest] = process.argv.slice(2);
if (!out || !dest) throw new Error('uso: node build-gaceta.mjs <out> <destino>');
mkdirSync(dest, { recursive: true });

const readGz = (f) => JSON.parse(gunzipSync(readFileSync(f)).toString('utf8'));
const clean = (s) => (typeof s === 'string' ? s.replace(/\s+/gu, ' ').trim() || null : s ?? null);
// La API no da una URL por aviso y no se inventa una: `enlace` es la Gaceta pública
// donde se consultan los avisos; la fila se identifica por `id_publicacion` y `codigo`.
const GACETA_URL = 'https://gacetadecomercio.gob.bo/#/publicaciones';
// Un nombre de empresa puede traer un correo o un número largo (teléfono, cédula): se tapan.
const redactions = { correo: 0, numero: 0 };
function scrub(text) {
  if (text == null) return text;
  let t = text.normalize('NFKC');
  t = t.replace(/[^\s@]+@[^\s@]+\.[^\s@]+/gu, () => (redactions.correo++, '[correo omitido]'));
  t = t.replace(/(?:\d[\s.\-–—()/]*){6,}/gu, () => (redactions.numero++, '[número omitido]'));
  return t;
}
const MAX_PART = 80 * 1024 * 1024;

const gDir = join(out, 'gaceta');
const files = readdirSync(gDir).filter((f) => /^g-\d+\.json\.gz$/.test(f)).sort();
const byId = new Map();
let rawRows = 0;
let pagesRead = 0;
for (const f of files) {
  const page = readGz(join(gDir, f));
  pagesRead++;
  for (const p of page.filas) {
    rawRows++;
    // Gana la lectura más reciente (los primeros archivos se vuelven a pedir al final).
    const prev = byId.get(p.id);
    if (prev && prev.retrieved_at > page.retrieved_at) continue;
    byId.set(p.id, { p, retrieved_at: page.retrieved_at });
  }
}

const rows = [...byId.values()]
  .map(({ p }) => ({
    source: 'seprec_gaceta',
    id_publicacion: p.id,
    codigo: clean(p.codigo),
    matricula: clean(p.matricula),
    matricula_anterior: clean(p.matriculaAnterior),
    razon_social: scrub(clean(p.razonSocial?.replace(/^["'\s]+|["'\s]+$/gu, ''))),
    tipo_publicacion: scrub(clean(p.titulo)),
    fecha_publicacion: p.fechaPublicacion ? String(p.fechaPublicacion).slice(0, 10) : null,
    enlace: GACETA_URL,
    fuente_api: 'https://servicios.seprec.gob.bo/api/publicaciones',
  }))
  .sort((a, b) => (b.fecha_publicacion ?? '').localeCompare(a.fecha_publicacion ?? '') || Number(b.id_publicacion) - Number(a.id_publicacion));

// Partes de ≤ 80 MB comprimidos (una publicación pesa ~300 B: normalmente una sola parte).
const parts = [];
let chunk = [];
const writePart = () => {
  if (!chunk.length) return;
  const name = `seprec-gaceta-${String(parts.length + 1).padStart(2, '0')}.ndjson.gz`;
  const gz = gzipSync(Buffer.from(chunk.join(''), 'utf8'), { level: 9 });
  if (gz.length > MAX_PART) throw new Error(`${name} supera 80 MB`);
  writeFileSync(join(dest, name), gz);
  parts.push({ name, rows: chunk.length, bytes: gz.length });
  chunk = [];
};
for (const r of rows) {
  chunk.push(JSON.stringify(r) + '\n');
  if (chunk.length >= 150_000) writePart();
}
writePart();

const count = (key) => {
  const o = {};
  for (const r of rows) o[r[key] ?? 'SIN DATO'] = (o[r[key] ?? 'SIN DATO'] ?? 0) + 1;
  return Object.fromEntries(Object.entries(o).sort((a, b) => b[1] - a[1]));
};
const dates = rows.map((r) => r.fecha_publicacion).filter(Boolean).sort();
const meta = existsSync(join(out, 'gaceta-meta.json')) ? JSON.parse(readFileSync(join(out, 'gaceta-meta.json'), 'utf8')) : null;
const byYear = {};
for (const d of dates) byYear[d.slice(0, 4)] = (byYear[d.slice(0, 4)] ?? 0) + 1;
const summary = {
  generated_at: new Date().toISOString(),
  paginas_leidas: pagesRead,
  paginas_declaradas: meta?.pages ?? null,
  filas_leidas: rawRows,
  publicaciones_unicas: rows.length,
  total_declarado_por_la_api: meta?.total ?? null,
  rango_fechas: { desde: dates[0] ?? null, hasta: dates.at(-1) ?? null },
  empresas_distintas: new Set(rows.map((r) => r.matricula).filter(Boolean)).size,
  sin_matricula: rows.filter((r) => !r.matricula).length,
  por_anio: byYear,
  por_tipo_publicacion: count('tipo_publicacion'),
  campos_tapados: redactions,
  partes: parts,
};
writeFileSync(join(dest, 'gaceta-summary.json'), JSON.stringify(summary, null, 2) + '\n');
console.log(JSON.stringify({ ...summary, por_tipo_publicacion: Object.keys(summary.por_tipo_publicacion).length + ' tipos' }, null, 1));

// manifest.json: sha256 de cada archivo de la entrega (empresas + Gaceta + scripts).
const sha = (f) => createHash('sha256').update(readFileSync(f)).digest('hex');
const listed = ls(dest).filter((n) => n !== 'manifest.json' && statSync(join(dest, n)).isFile()).sort();
const entries = listed.map((name) => ({ name, bytes: statSync(join(dest, name)).size, sha256: sha(join(dest, name)) }));
const sdir = join(dest, 'scripts');
if (existsSync(sdir)) for (const name of ls(sdir).sort()) entries.push({ name: `scripts/${name}`, bytes: statSync(join(sdir, name)).size, sha256: sha(join(sdir, name)) });
const prev = existsSync(join(dest, 'manifest.json')) ? JSON.parse(readFileSync(join(dest, 'manifest.json'), 'utf8')) : {};
writeFileSync(join(dest, 'manifest.json'), JSON.stringify({ ...prev, generated_at: summary.generated_at, gaceta_rows: rows.length, files: entries }, null, 2) + '\n');
