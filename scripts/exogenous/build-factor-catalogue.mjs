import { readFileSync, writeFileSync, mkdirSync, existsSync, readdirSync } from 'node:fs';
import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '../..');
const destination = resolve(root, '../observatorio-dashboard/src/data');
mkdirSync(destination, { recursive: true });

/** RFC4180, including quoted commas, quotes and newlines. */
export function parseCsv(text) {
  const rows = [];
  let row = [],
    cell = '',
    quoted = false;
  for (let i = 0; i < text.length; i++) {
    const c = text[i];
    if (c === '"') {
      if (quoted && text[i + 1] === '"') {
        cell += '"';
        i++;
      } else quoted = !quoted;
    } else if (c === ',' && !quoted) {
      row.push(cell);
      cell = '';
    } else if (c === '\n' && !quoted) {
      row.push(cell.replace(/\r$/, ''));
      rows.push(row);
      row = [];
      cell = '';
    } else cell += c;
  }
  if (quoted) throw new Error('CSV con comillas sin cerrar');
  if (cell || row.length) {
    row.push(cell.replace(/\r$/, ''));
    rows.push(row);
  }
  const header = rows.shift();
  return rows
    .filter((r) => r.some(Boolean))
    .map((r) => {
      if (r.length !== header.length) throw new Error('Columnas inconsistentes');
      return Object.fromEntries(header.map((key, i) => [key.replace(/^\uFEFF/, ''), r[i]]));
    });
}

const labels = [
  'Agropecuaria, forestal y pesca',
  'Minas y canteras',
  'Manufactura',
  'Electricidad y gas',
  'Agua, saneamiento y residuos',
  'Construcción',
  'Comercio y reparación',
  'Transporte y almacenamiento',
  'Alojamiento y gastronomía',
  'Información y comunicación',
  'Finanzas y seguros',
  'Inmobiliarias',
  'Servicios profesionales y científicos',
  'Servicios administrativos y de apoyo',
  'Administración pública',
  'Educación',
  'Salud y asistencia social',
  'Cultura, entretenimiento y deporte',
  'Otros servicios',
  'Hogares y cuidados',
  'Organismos internacionales',
];
const sectors = labels.map((label, i) => ({ id: String.fromCharCode(65 + i), label }));
const serviceSectors = {
  COMERCIO: ['G'],
  TRANSPORTE: ['H'],
  LOGISTICA: ['H', 'G'],
  TURISMO: ['I', 'N'],
  DIGITAL: ['J'],
  SALUD: ['Q'],
  EDUCACION: ['P'],
  PROFESIONALES: ['M', 'N'],
  CREATIVA: ['R', 'S'],
  ADMINISTRACION: ['O', 'U'],
  HOGARES: ['T', 'S'],
  AGUA_RESIDUOS: ['E'],
  TERRITORIO: ['L', 'T', 'O'],
};
function sectorIds(row) {
  if (serviceSectors[row.sector]) return serviceSectors[row.sector];
  if (/^PRD_(AG|LV|FO)/.test(row.id)) return ['A'];
  if (/^PRD_MI/.test(row.id)) return ['B'];
  if (/^PRD_MA/.test(row.id)) return ['C'];
  if (/^PRD_CO0[67]/.test(row.id)) return ['L'];
  if (/^PRD_CO/.test(row.id)) return ['F'];
  if (/^PRD_EN/.test(row.id))
    return row.sector.startsWith('Electricidad') ? ['D'] : ['B', 'D', 'H'];
  if (/^PRD_CL/.test(row.id)) return ['A', 'D', 'E', 'H'];
  if (
    [
      'Banca',
      'Microfinanzas',
      'Inclusión',
      'Capitales locales',
      'Seguros',
      'Pensiones',
      'Monetario',
      'Mercados globales',
    ].includes(row.sector)
  )
    return ['K'];
  if (['Fiscal', 'Regulatorio', 'Riesgo institucional', 'Riesgo externo'].includes(row.sector))
    return ['O', 'U'];
  if (['Remesas', 'Hogares y empleo'].includes(row.sector)) return ['T', 'G', 'S'];
  return ['A', 'B', 'C', 'G', 'K', 'O'];
}
function mechanisms(row) {
  if (/^PRD_CL|sanidad|plagas|clima/i.test(`${row.id} ${row.sector}`))
    return ['Riesgo físico', 'Oferta y disponibilidad'];
  if (
    [
      'Banca',
      'Microfinanzas',
      'Inclusión',
      'Capitales locales',
      'Seguros',
      'Pensiones',
      'Monetario',
      'Mercados globales',
      'Divisas',
      'Fiscal',
    ].includes(row.sector)
  )
    return ['Financiamiento', 'Costos'];
  if (
    ['Regulatorio', 'Riesgo institucional', 'Riesgo externo', 'ADMINISTRACION'].includes(row.sector)
  )
    return ['Regulación', 'Demanda'];
  if (['TRANSPORTE', 'LOGISTICA'].includes(row.sector)) return ['Acceso y logística', 'Costos'];
  if (['HOGARES', 'TERRITORIO', 'Hogares y empleo', 'Remesas'].includes(row.sector))
    return ['Demanda', 'Exposición territorial'];
  if (['SALUD', 'EDUCACION', 'AGUA_RESIDUOS', 'DIGITAL'].includes(row.sector))
    return ['Oferta y disponibilidad', 'Exposición territorial'];
  if (/^PRD_/.test(row.id)) return ['Costos', 'Oferta y disponibilidad'];
  return ['Demanda', 'Costos'];
}
const rows = parseCsv(
  readFileSync(
    resolve(root, 'docs/research/exogenas-2026-10/catalogo_consolidado.csv'),
    'utf8',
  ).replace(/^\uFEFF/, ''),
);
const families = rows.map((r) => ({
  id: r.id,
  name: r.variable,
  sectorLabel: r.sector,
  sectorIds: sectorIds(r),
  definition: r.definicion,
  unit: r.unidad,
  frequency: r.frecuencia,
  geography: r.geografia,
  channel: r.canal,
  lagHypothesis: r.rezago_hipotesis,
  sourceUrl: r.fuente_url || null,
  priority: r.prioridad,
  role: r.rol_filtro,
  roleDetail: r.rol,
  availability: r.disponibilidad,
  mechanisms: mechanisms(r),
  desk: r.mesa_origen,
  seriesCount: 0,
}));
if (
  new Set(families.map((f) => f.id)).size !== families.length ||
  families.some((f) => !f.role || !f.sectorIds.length)
)
  throw new Error('Catálogo incompleto o duplicado');
const data = {
  version: 1,
  classification:
    'CIIU Rev. 4; correspondencia editorial de sectores receptores, no codificación oficial de establecimientos',
  sectors,
  families,
};
// El snapshot permite desplegar lectura y migración en distinto orden. No sustituye datos ausentes.
const seed = resolve(root, 'src/database/seeds/boot/exogenous-factors.json');
if (!existsSync(seed))
  throw new Error('Falta exogenous-factors.json; ejecuta exogenous:factors antes de sincronizar.');
const { exogenousFactorsSchema } =
  await import('../../src/database/seeds/schemas/exogenous-factors.schema.ts');
const parsed = exogenousFactorsSchema.parse(JSON.parse(readFileSync(seed, 'utf8')));
const snapshot = {
  version: 1,
  series: parsed.series.filter((s) => s.licenseStatus === 'PUBLIC_REUSE_ALLOWED'),
};
const boot = resolve(root, 'src/database/seeds/boot');
const legacyFiles = [
  'exogenous-prices.json',
  'exogenous-customs.json',
  ...readdirSync(resolve(boot, 'exogenous-currencies'))
    .filter((f) => f.endsWith('.json'))
    .map((f) => `exogenous-currencies/${f}`),
];
const legacy = legacyFiles
  .flatMap((file) => JSON.parse(readFileSync(resolve(boot, file), 'utf8')).series)
  .map((s) => ({
    ...s,
    points: s.points.map(({ excerpt, ...p }) => p),
  }));
// Validar y leer todas las entradas antes de reemplazar cualquiera de las copias.
writeFileSync(
  resolve(destination, 'exogenous-catalogue.json'),
  JSON.stringify(data, null, 2) + '\n',
);
writeFileSync(
  resolve(destination, 'exogenous-factor-snapshot.json'),
  JSON.stringify(snapshot) + '\n',
);
writeFileSync(
  resolve(destination, 'exogenous-legacy-snapshot.json'),
  JSON.stringify({ version: 1, series: legacy }) + '\n',
);
console.log(`${families.length} familias, ${sectors.length} sectores; catálogo sincronizado.`);
