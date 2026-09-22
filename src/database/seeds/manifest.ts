import type { SeedPackageDeclaration } from './schemas/seed-manifest.schema';

/**
 * Every seed package this build carries, by the name it can be asked for.
 *
 * The list exists because «boot seeds» was one word for four different things.
 * Six catalogues are the rows every other table points at, and an environment
 * without them cannot admit an observation at all. One package holds the
 * technical identities the collectors sign with. Seventeen are corpora that
 * take minutes and gigabytes and that a fresh development database has no
 * reason to load. And one is synthetic data that must never reach production.
 * Treating all four as «the seeds» is what made «the deployment is seeded» a
 * sentence with no checkable meaning.
 *
 * Ordering is not written here. It is derived from `dependsOn`, so adding a
 * package cannot silently land in the wrong place in a hand-kept sequence.
 *
 * A version is bumped by hand and a checksum is computed from the files. That
 * pairing is the whole contract: editing a catalogue without bumping its
 * version produces a checksum the ledger disagrees with, and the portal reports
 * a conflict instead of quietly reconciling a package nobody reviewed.
 */

const historical = (
  code: string,
  label: string,
  files: readonly string[],
  /*
   * La version se sube a mano cuando los archivos del paquete cambian, y el
   * registro de siembra es quien lo exige: su clave unica es destino, paquete y
   * version, y la fila solo se actualiza cuando la huella coincide. Dejar la
   * version quieta despues de cambiar el corpus deja al portal enseñando la
   * huella anterior como si nada hubiera entrado.
   */
  version = '1.0.0',
): SeedPackageDeclaration => ({
  code,
  version,
  kind: 'HISTORICAL_DATA',
  files: [...files],
  dependsOn: [
    { code: 'core-catalogues', version: '1.0.0' },
    { code: 'collector-identities', version: '1.0.0' },
  ],
  minimumSchemaVersion: '0074',
  ownership: 'create_only',
  requiredFor: ['tablero-publico'],
  label,
});

export const SEED_PACKAGES: readonly SeedPackageDeclaration[] = [
  {
    code: 'core-catalogues',
    version: '1.0.0',
    kind: 'REQUIRED_METADATA',
    files: [
      'boot/frequencies.json',
      'boot/units.json',
      'boot/currencies.json',
      'boot/geographic-units.json',
      'boot/countries.json',
      'boot/statistical-domains.json',
      'boot/quality-dimensions.json',
      'boot/economic-activities.json',
    ],
    dependsOn: [],
    minimumSchemaVersion: '0013',
    ownership: 'seed_owned',
    requiredFor: ['ingesta', 'gobernanza', 'calidad', 'tablero-publico'],
    label: 'Catálogos base (frecuencias, unidades, territorio, dominios)',
  },
  {
    code: 'collector-identities',
    version: '1.0.0',
    kind: 'OBSERVATORY_BASELINE',
    files: ['boot/agent-bootstrap.json'],
    dependsOn: [{ code: 'core-catalogues', version: '1.0.0' }],
    minimumSchemaVersion: '0018',
    ownership: 'seed_owned',
    requiredFor: ['ingesta'],
    label: 'Identidades técnicas de los recolectores',
  },
  {
    code: 'source-schedules',
    version: '1.0.0',
    kind: 'OBSERVATORY_BASELINE',
    files: ['boot/source-schedules.json'],
    dependsOn: [{ code: 'collector-identities', version: '1.0.0' }],
    minimumSchemaVersion: '0075',
    ownership: 'seed_owned',
    requiredFor: ['frescura-de-fuentes'],
    label: 'Calendarios declarados de las fuentes',
  },
  historical('exchange-rate-history', 'Histórico de tipo de cambio', [
    'boot/fx-official-history.json',
    'boot/fx-official-history-2024.json',
    'boot/fx-official-history-2025.json',
    'boot/fx-parallel-history.json',
    'boot/fx-parallel-history-2024.json',
    'boot/fx-parallel-history-2025.json',
  ]),
  historical('macro-annual-history', 'Series macroeconómicas anuales', [
    'boot/macro-annual-history.json',
    'boot/macro-annual-history-1960.json',
    'boot/macro-annual-debt.json',
    'boot/macro-annual-financial.json',
    'boot/macro-annual-fx.json',
    'boot/macro-annual-governance.json',
    'boot/macro-annual-imf.json',
    'boot/macro-annual-rates.json',
    'boot/macro-annual-sectors.json',
    'boot/macro-annual-social.json',
  ]),
  historical('market-prices', 'Precios de mercados', ['boot/market-prices.json']),
  historical('bcb-quotes', 'Cotizaciones del BCB', ['boot/bcb-quotes.json']),
  historical('stablecoin-books', 'Libros de fichas estables en bolivianos', [
    'boot/stablecoin-books.json',
  ]),
  historical('ufv-history', 'Histórico de la UFV', ['boot/ufv-history.json']),
  historical('bbv-yields', 'Rendimientos soberanos de la BBV', ['boot/bbv-yields.json']),
  historical('composite-indices', 'Índices compuestos', ['boot/composite-indices.json']),
  historical('foreign-trade', 'Comercio exterior', ['boot/foreign-trade.json']),
  historical('mineral-trade', 'Minerales exportados por partida', ['boot/mineral-trade.json']),
  /*
   * Los tres van juntos porque los carga un mismo sembrador y comparten
   * esquema, no porque compartan fuente: los dos primeros son del INE y el
   * tercero recopila dos publicaciones privadas. Quien los pida por separado
   * tiene la procedencia en cada fila, que es donde importa.
   */
  historical('annual-registers', 'Registros anuales por departamento y por empresa', [
    'boot/department-accounts.json',
    'boot/department-exports.json',
    'boot/corporate-register.json',
  ]),
  historical('company-filings', 'Hechos relevantes de emisores', ['boot/company-filings.json']),
  historical('company-filings-archive', 'Archivo de hechos relevantes', [
    'boot/company-filings-archive.json',
  ]),
  historical('company-filing-texts', 'Textos de hechos relevantes', [
    'boot/company-filing-texts.json',
  ]),
  historical('press-coverage', 'Cobertura de prensa corriente', ['boot/press-coverage.json']),
  historical('press-archive', 'Archivo de prensa 2020-2026', [
    'boot/press-archive-2020.json',
    'boot/press-archive-2021.json',
    'boot/press-archive-2022.json',
    'boot/press-archive-2023.json',
    'boot/press-archive-2024.json',
    'boot/press-archive-2025.json',
    'boot/press-archive-2026.json',
  ]),
  historical('social-readings', 'Lecturas de comercio y consumo', ['boot/social-readings.json']),
  historical('worldbank-panel', 'Panel del Banco Mundial', ['boot/worldbank-panel/']),
  historical(
    'bolivia-poi',
    'Lugares de las tres ciudades',
    ['boot/bolivia-poi/', 'boot/bolivia-capitals-poi/'],
    // 2026-09-21: las otras capitales pasan de 2.155 a 4.150 con el catálogo
    // nuevo. Las tres ciudades no se tocan.
    '1.1.0',
  ),
  historical(
    'bolivia-national-poi',
    'Lugares del país',
    [
      'boot/bolivia-national-poi/',
      'boot/bolivia-expansion-poi/',
      'boot/bolivia-registry-poi/',
      'boot/bolivia-registry-additional-poi/',
      'boot/bolivia-establishments-poi/',
      'boot/bolivia-establishments-registry-poi/',
    ],
    // 2026-09-21: el catálogo de 2.330 familias clasificó las 40.482 filas que
    // esperaban, y entraron las 6.584 de la entrega de establecimientos.
    '1.1.0',
  ),
  {
    code: 'observatory-demo',
    version: '1.0.0',
    kind: 'DEMO_DATA',
    files: ['mock/observatory-demo.json'],
    dependsOn: [{ code: 'core-catalogues', version: '1.0.0' }],
    minimumSchemaVersion: '0013',
    ownership: 'create_only',
    requiredFor: [],
    label: 'Datos sintéticos de demostración',
  },
];

/**
 * Which package classes a deployment profile is expected to carry.
 *
 * Demo data is in no profile. It is not a degree of completeness; it is a
 * different kind of content, and it needs its own switch precisely so that
 * «load everything» can never mean «load the fake rows too».
 */
export const PROFILE_KINDS = {
  metadata: ['REQUIRED_METADATA'],
  baseline: ['REQUIRED_METADATA', 'OBSERVATORY_BASELINE'],
  historical: ['REQUIRED_METADATA', 'OBSERVATORY_BASELINE', 'HISTORICAL_DATA'],
} as const;

export function findDeclaration(code: string): SeedPackageDeclaration | undefined {
  return SEED_PACKAGES.find((declaration) => declaration.code === code);
}
