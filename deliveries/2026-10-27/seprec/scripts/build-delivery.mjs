/**
 * Arma la entrega: una fila por unidad económica, NDJSON comprimido con gzip,
 * partido en archivos de 90 MB como máximo, más `summary.json` y
 * `manifest.json` con los sha256.
 *
 * Reglas de datos personales (las del proyecto, ver
 * `scripts/places/read-registry-delivery.mjs`):
 *  - Teléfonos y correos no llegan aquí: `collect-details.mjs` los descarta
 *    antes de escribir a disco.
 *  - Empresa unipersonal con el domicilio declarado como vivienda (el campo
 *    `edificio` o la vía dicen «vivienda», «particular», «casa», «domicilio»):
 *    `domicilio_vivienda: true`, dirección y coordenadas vacías, también en `raw`.
 *  - No se guardan representantes, socios ni el `resumen` de la Gaceta.
 *
 *   node build-delivery.mjs <out> <destino>
 */
import { readdirSync, readFileSync, writeFileSync, appendFileSync, mkdirSync, existsSync, statSync, createReadStream } from 'node:fs';
import { gunzipSync, gzipSync } from 'node:zlib';
import { createHash } from 'node:crypto';
import { join } from 'node:path';

const [out, dest] = process.argv.slice(2);
if (!out || !dest) throw new Error('uso: node build-delivery.mjs <out> <destino>');
mkdirSync(dest, { recursive: true });

const API = 'https://servicios.seprec.gob.bo/api/';
const RESIDENCE = /particular|vivienda|\bcasa\b|domicilio/iu;
const MAX_PART = 90 * 1024 * 1024;

const readGz = (f) => JSON.parse(gunzipSync(readFileSync(f)).toString('utf8'));
const clean = (s) => (typeof s === 'string' ? s.replace(/\s+/gu, ' ').trim() || null : s ?? null);

// 1. Listado: se recorre página por página más abajo (entero no cabe en una
// máquina con poca RAM libre); aquí solo se guardan las claves vistas.
const seenKeys = new Set();

// 2. Fichas
const details = new Map();
const detailStatus = new Map();
const dDir = join(out, 'details');
if (existsSync(dDir)) {
  for (const f of readdirSync(dDir)) {
    for (const line of readFileSync(join(dDir, f), 'utf8').split('\n')) {
      if (!line) continue;
      let d;
      try {
        d = JSON.parse(line);
      } catch {
        continue;
      }
      detailStatus.set(d.key, d.status);
      if (d.status === 200) details.set(d.key, d);
    }
  }
}

// 3. Gaceta, por matrícula (nueva y anterior)
const gaceta = new Map();
let gacetaRows = 0;
const gDir = join(out, 'gaceta');
if (existsSync(gDir)) {
  const seen = new Set();
  for (const f of readdirSync(gDir).sort()) {
    for (const p of readGz(join(gDir, f)).filas) {
      if (seen.has(p.id)) continue;
      seen.add(p.id);
      gacetaRows++;
      const pub = { id: p.id, codigo: p.codigo, titulo: clean(p.titulo), fecha: p.fechaPublicacion?.slice(0, 10) ?? null };
      for (const m of new Set([p.matricula, p.matriculaAnterior].filter(Boolean))) {
        if (!gaceta.has(m)) gaceta.set(m, []);
        gaceta.get(m).push(pub);
      }
    }
  }
}
const CONSTITUTION = /^constituci[oó]n/iu;

function estadoDe(r) {
  const act = r.codEstadoActualizacion?.nombre;
  if (r.estado === 'CANCELADO') return 'cancelada';
  if (r.estado === 'ACTIVO') return act === 'MATRICULA RENOVADA' ? 'vigente' : 'no_actualizada';
  return (r.estado ?? 'desconocido').toLowerCase();
}

function direccionDe(d) {
  if (!d) return null;
  const via = [clean(d.codTipoVia?.nombre), clean(d.nombreVia)].filter(Boolean).join(' ');
  const num = clean(d.numeroDomicilio);
  const parts = [via && num ? `${via} ${num}` : via || num, clean(d.edificio), d.piso ? `piso ${clean(d.piso)}` : null].filter(Boolean);
  return parts.length ? parts.join(', ') : null;
}

const counts = { departamento: {}, tipo_societario: {}, estado: {}, estado_por_departamento: {}, con_ficha: 0, domicilio_vivienda: 0, con_coordenadas: 0, con_fecha_constitucion_gaceta: 0, con_publicaciones_gaceta: 0 };
const bump = (o, k) => (o[k ?? 'SIN DATO'] = (o[k ?? 'SIN DATO'] ?? 0) + 1);

const parts = [];
let buf = [];
let bufBytes = 0;
let current = null;
let renewed = 0;
/*
 * Cada bloque de ~24 MB se comprime como un miembro gzip y se añade a la parte
 * en curso (gzip admite miembros concatenados: zcat, gunzip y zlib los leen de
 * corrido). La parte se cierra al pasar de 80 MB, así ninguna llega a 90 MB.
 */
function flush(final = false) {
  if (buf.length) {
    if (!current) {
      current = { name: `seprec-empresas-${String(parts.length + 1).padStart(2, '0')}.ndjson.gz`, rows: 0, bytes: 0 };
      parts.push(current);
      writeFileSync(join(dest, current.name), Buffer.alloc(0));
    }
    const gz = gzipSync(Buffer.from(buf.join(''), 'utf8'), { level: 9 });
    appendFileSync(join(dest, current.name), gz);
    current.rows += buf.length;
    current.bytes += gz.length;
    buf = [];
    bufBytes = 0;
  }
  if (final || (current && current.bytes > 80 * 1024 * 1024)) current = null;
}

for (const f of readdirSync(join(out, 'list')).sort()) {
 const page = readGz(join(out, 'list', f));
 const listAt = page.retrieved_at;
 for (const r of page.filas) {
  const key = `${r.id}/${r.idEstablecimiento}`;
  if (seenKeys.has(key)) continue;
  seenKeys.add(key);
  if (r.codEstadoActualizacion?.nombre === 'MATRICULA RENOVADA') renewed++;
  const det = details.get(key);
  const d = det?.datos;
  const tipo = clean(r.codTipoUnidadEconomica?.nombre);
  const dir = d?.direccion ?? null;
  const residence = !!dir && (RESIDENCE.test(String(dir.edificio ?? '')) || RESIDENCE.test(String(dir.nombreVia ?? '')));
  const hideAddress = residence && tipo === 'EMPRESA UNIPERSONAL';
  let rawDetail = null;
  if (d) {
    rawDetail = structuredClone(d);
    if (hideAddress) {
      for (const k of ['nombreVia', 'numeroDomicilio', 'edificio', 'piso', 'latitud', 'longitud', 'codTipoVia']) delete rawDetail.direccion[k];
    }
  }
  const pubs = [...new Map([...(gaceta.get(r.matricula) ?? []), ...(gaceta.get(r.matriculaAnterior) ?? [])].map((p) => [p.id, p])).values()].sort((a, b) => (a.fecha ?? '').localeCompare(b.fecha ?? ''));
  const constitucion = pubs.find((p) => CONSTITUTION.test(p.titulo ?? ''));
  const lat = !hideAddress && dir?.latitud ? Number(dir.latitud) : null;
  const lon = !hideAddress && dir?.longitud ? Number(dir.longitud) : null;
  const estado = estadoDe(r);
  const departamento = clean(r.direccion?.codDepartamento?.nombre ?? dir?.codDepartamento?.nombre);
  const rec = {
    source: 'seprec',
    id_seprec: r.id,
    matricula: clean(r.matricula),
    matricula_anterior: clean(r.matriculaAnterior),
    nit: clean(d?.nit) ?? null,
    razon_social: clean(r.razonSocial?.replace(/^["'\s]+|["'\s]+$/gu, '')),
    tipo_societario: tipo,
    estado,
    estado_registro: r.estado ?? null,
    estado_actualizacion: r.codEstadoActualizacion?.nombre ?? null,
    fecha_inscripcion: null,
    fecha_constitucion_gaceta: constitucion?.fecha ?? null,
    fecha_actualizacion: null,
    ultimo_anio_renovado: d?.ultimoAnioActualizacion ?? null,
    mes_cierre_gestion: d?.mesCierreGestion ? Number(d.mesCierreGestion) : null,
    actividad_codigo: null,
    actividad: d?.objetos_sociales?.length ? d.objetos_sociales.map((o) => clean(o.objetoSocial)).filter(Boolean).join(' | ') || null : null,
    departamento,
    provincia: clean(dir?.codProvincia?.nombre),
    municipio: clean(dir?.codMunicipio?.nombre),
    direccion: hideAddress ? null : direccionDe(dir),
    latitud: Number.isFinite(lat) ? lat : null,
    longitud: Number.isFinite(lon) ? lon : null,
    domicilio_vivienda: dir ? residence : null,
    sitio_web: d?.sitio_web ?? null,
    sucursales: null,
    publicaciones_gaceta: pubs.length ? pubs : null,
    // obtenida | no_publicada_412 (la API la niega) | no_descargada (renovada: la API la publica,
    // pero Cloudflare corta esa ruta a un navegador automatizado; ver README) | no_publicada
    // (no renovada o cancelada: el portal no muestra ficha)
    ficha_publica: det ? 'obtenida' : detailStatus.get(key) === 412 ? 'no_publicada_412' : r.codEstadoActualizacion?.nombre === 'MATRICULA RENOVADA' ? 'no_descargada' : 'no_publicada',
    source_url: det
      ? `${API}empresas/informacionBasicaEmpresa/${r.id}/establecimiento/${r.idEstablecimiento}`
      : `${API}empresas/buscarEmpresas?filtro=${encodeURIComponent(r.matricula ?? r.razonSocial ?? '')}&tipoFiltro=${r.matricula ? 'matricula' : 'nombre'}&limite=10&pagina=1`,
    retrieved_at: det?.retrieved_at ?? listAt,
    raw: { listado: r, ficha: rawDetail },
  };
  bump(counts.departamento, departamento);
  bump(counts.tipo_societario, tipo);
  counts.tipo_por_estado ??= {};
  counts.tipo_por_estado[tipo ?? 'SIN DATO'] ??= {};
  bump(counts.tipo_por_estado[tipo ?? 'SIN DATO'], estado);
  bump(counts.estado, estado);
  // El 398.131 del SEPREC cuenta unidades «vigentes» en el sentido de no
  // canceladas (estado ACTIVO), renovadas o no; por eso se cuenta aparte.
  bump((counts.estado_registro ??= {}), r.estado);
  counts.estado_por_departamento[departamento ?? 'SIN DATO'] ??= {};
  bump(counts.estado_por_departamento[departamento ?? 'SIN DATO'], estado);
  if (det) counts.con_ficha++;
  if (residence) counts.domicilio_vivienda++;
  if (rec.latitud != null) counts.con_coordenadas++;
  if (rec.fecha_constitucion_gaceta) counts.con_fecha_constitucion_gaceta++;
  if (pubs.length) counts.con_publicaciones_gaceta++;
  const line = JSON.stringify(rec) + '\n';
  buf.push(line);
  bufBytes += Buffer.byteLength(line);
  if (bufBytes > 24 * 1024 * 1024) flush();
 }
}
flush(true);
for (const p of parts) if (p.bytes > MAX_PART) throw new Error(`${p.name} pesa ${p.bytes} bytes, más de 90 MB`);

const listMeta = existsSync(join(out, 'list-meta.json')) ? JSON.parse(readFileSync(join(out, 'list-meta.json'), 'utf8')) : null;
const gacetaMeta = existsSync(join(out, 'gaceta-meta.json')) ? JSON.parse(readFileSync(join(out, 'gaceta-meta.json'), 'utf8')) : null;
const summary = {
  generated_at: new Date().toISOString(),
  unidades: seenKeys.size,
  total_declarado_por_la_api: listMeta?.total ?? null,
  referencia_vigentes_nov_2025: 398131,
  renovadas_en_listado: renewed,
  fichas_pedidas: detailStatus.size,
  fichas_412: [...detailStatus.values()].filter((s) => s === 412).length,
  gaceta_publicaciones: gacetaRows,
  gaceta_total_declarado: gacetaMeta?.total ?? null,
  ...counts,
  partes: parts,
};
writeFileSync(join(dest, 'summary.json'), JSON.stringify(summary, null, 2) + '\n');

async function sha256(f) {
  const h = createHash('sha256');
  for await (const chunk of createReadStream(f)) h.update(chunk);
  return h.digest('hex');
}
const files = [];
for (const name of readdirSync(dest).sort()) {
  if (name === 'manifest.json' || statSync(join(dest, name)).isDirectory()) continue;
  files.push({ name, bytes: statSync(join(dest, name)).size, sha256: await sha256(join(dest, name)) });
}
const sdir = join(dest, 'scripts');
if (existsSync(sdir)) {
  for (const name of readdirSync(sdir).sort()) files.push({ name: `scripts/${name}`, bytes: statSync(join(sdir, name)).size, sha256: await sha256(join(sdir, name)) });
}
writeFileSync(join(dest, 'manifest.json'), JSON.stringify({ source: 'seprec', generated_at: summary.generated_at, rows: seenKeys.size, files }, null, 2) + '\n');
console.log(JSON.stringify({ unidades: seenKeys.size, con_ficha: counts.con_ficha, partes: parts }, null, 1));
