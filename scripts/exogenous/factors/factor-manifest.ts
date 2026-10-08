import { WDI_ENTRIES } from './wdi-entries';
import type { WdiEntry } from './wdi-entries';
import type { ExogenousFactorSeries } from '../../../src/database/seeds/schemas/exogenous-factors.schema';

export type FactorSpec = Omit<ExogenousFactorSeries, 'points' | 'sourceUrl' | 'freshnessDays'> & {
  connector: 'WDI' | 'NOAA_ONI' | 'NYFED';
  indicator: string;
  country: string;
};

const WDI_LICENSE =
  'https://datacatalog.worldbank.org/search/dataset/0037712/world-development-indicators';

const WDI_FINANCIAL_ENTRIES: readonly WdiEntry[] = [
  [
    'FR.INR.LEND',
    'Tasa de interés activa de referencia',
    'MF_LOAN_RATES',
    'K',
    'RATE',
    '% anual',
    'CONDITION',
    'Referencia anual WDI de préstamos; proxy del costo financiero, no tasa efectiva por banco producto o cliente.',
  ],
  [
    'FR.INR.DPST',
    'Tasa de interés de depósitos de referencia',
    'MF_DEPOSIT_RATES',
    'K',
    'RATE',
    '% anual',
    'CONDITION',
    'Referencia anual WDI de depósitos; no desagrega entidad plazo ni moneda.',
  ],
  [
    'FR.INR.RINR',
    'Tasa de interés activa real de referencia',
    'MF_LOAN_RATES',
    'K',
    'RATE',
    '% anual real',
    'CONDITION',
    'Tasa activa ajustada por inflación medida con deflactor del PIB según WDI. Proxy real de financiación; no tasa nominal ni deflactada por IPC.',
  ],
];

function wdi(entry: WdiEntry, country = 'BOL', geography = 'Bolivia'): FactorSpec {
  const [indicator, name, family, sectors, measureType, unit, economicRole, note] = entry;
  return {
    code: `EXF_WDI_${country}_${indicator.replaceAll('.', '_')}`,
    familyIds: [family],
    sectorIds: sectors.split(','),
    name: `${name} — ${geography}`,
    measureType,
    unit,
    frequency: 'ANNUAL',
    geography,
    market: 'Estadística nacional anual',
    publisher: 'Banco Mundial — WDI (compilador)',
    sourceSeriesKey: `WDI:${country}:${indicator}`,
    economicRole,
    targetScope:
      country === 'BOL'
        ? `${name}: contexto nacional de Bolivia; no efecto causal identificado`
        : 'Demanda externa potencial de exportaciones bolivianas; crecimiento del socio no es shock identificado',
    observationStatus: 'ESTIMATED',
    measurementStatus: 'PROXY',
    transformationType: 'ORIGINAL',
    licenseStatus: 'PUBLIC_REUSE_ALLOWED',
    connector: 'WDI',
    indicator,
    country,
    note: `${note} Adaptación de WDI ya usado por el módulo macro; no nueva fuente independiente. Publicación por observación desconocida. Estadística compilada, sujeta a estimaciones y revisiones. CC BY 4.0: ${WDI_LICENSE}`,
  };
}

export const FACTOR_MANIFEST: readonly FactorSpec[] = [
  ...[...WDI_ENTRIES, ...WDI_FINANCIAL_ENTRIES].map((entry) => wdi(entry)),
  ...(
    [
      ['BRA', 'Brasil'],
      ['ARG', 'Argentina'],
      ['CHN', 'China'],
      ['PER', 'Perú'],
      ['CHL', 'Chile'],
      ['USA', 'Estados Unidos'],
    ] as const
  ).map(([country, geography]) =>
    wdi(
      [
        'NY.GDP.MKTP.KD.ZG',
        'Crecimiento real del PIB',
        'MF_PARTNER_GROWTH',
        'G',
        'RATE',
        '% anual',
        'EXTERNAL_DRIVER',
        'Contexto de demanda del socio; no sustituye importaciones específicas desde Bolivia.',
      ],
      country,
      geography,
    ),
  ),
  {
    code: 'EXF_NOAA_ONI',
    familyIds: ['PRD_CL06'],
    sectorIds: ['A', 'D', 'E'],
    name: 'ENSO — Oceanic Niño Index (ONI)',
    measureType: 'INDEX',
    unit: '°C anomalía',
    frequency: 'MONTHLY',
    geography: 'Pacífico tropical — Niño 3.4',
    market: 'Océano Pacífico',
    publisher: 'NOAA / National Weather Service / Climate Prediction Center',
    sourceSeriesKey: 'NOAA:ONI',
    connector: 'NOAA_ONI',
    indicator: 'ONI',
    country: '',
    economicRole: 'EXTERNAL_DRIVER',
    targetScope:
      'Riesgo climático de agricultura agua y electricidad en Bolivia; relación local requiere estimación',
    observationStatus: 'ESTIMATED',
    measurementStatus: 'DIRECT',
    transformationType: 'ANOMALY',
    licenseStatus: 'PUBLIC_REUSE_ALLOWED',
    note: 'Media móvil de tres meses, etiquetada por mes central; DJF se guarda como enero, no como trimestre calendario ni lluvia boliviana. Sin fecha de publicación por revisión: publishedAt null. NOAA/NWS permite reutilización con atribución y sin implicar respaldo: https://www.weather.gov/disclaimer',
  },
  {
    code: 'EXF_NYFED_EFFR',
    familyIds: ['MF_FEDFUNDS'],
    sectorIds: ['K'],
    name: 'Effective Federal Funds Rate — EFFR',
    measureType: 'RATE',
    unit: '% anual',
    frequency: 'DAILY',
    geography: 'Estados Unidos',
    market: 'Federal funds overnight',
    publisher: 'Federal Reserve Bank of New York',
    sourceSeriesKey: 'NYFED:EFFR',
    connector: 'NYFED',
    indicator: 'EFFR',
    country: 'USA',
    economicRole: 'EXTERNAL_DRIVER',
    targetScope: 'Condiciones de financiación externa de Bolivia; no tasa bancaria boliviana',
    observationStatus: 'OBSERVED',
    measurementStatus: 'DIRECT',
    transformationType: 'ORIGINAL',
    licenseStatus: 'PENDING_REVIEW',
    note: 'Tasa efectiva diaria; no rango objetivo ni publicación observada. No se rellenan fines de semana. Términos con condiciones específicas de atribución y redistribución pendientes de integrar al producto: https://www.newyorkfed.org/privacy/termsofuse.html',
  },
];

export function factorSourceUrl(spec: FactorSpec, now: Date): string {
  if (spec.connector === 'NOAA_ONI')
    return 'https://www.cpc.ncep.noaa.gov/data/indices/oni.ascii.txt';
  if (spec.connector === 'NYFED')
    return `https://markets.newyorkfed.org/api/rates/unsecured/effr/search.json?startDate=2000-01-01&endDate=${now.toISOString().slice(0, 10)}`;
  return `https://api.worldbank.org/v2/country/${spec.country}/indicator/${spec.indicator}?format=json&per_page=1000&date=2000:${now.getUTCFullYear()}&source=2`;
}
