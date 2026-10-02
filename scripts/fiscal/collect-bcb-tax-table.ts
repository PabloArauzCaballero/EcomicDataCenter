import { Workbook } from '../macro/xlsx-cells';
import {
  describe,
  download,
  fail,
  thousandsToMillions,
  writeFamily,
  yearDate,
  yearOf,
  type AccountSeries,
} from './public-accounts-seed';

/**
 * La recaudación de impuestos internos, impuesto por impuesto, en bolivianos.
 *
 * Es el cuadro 13.05 del Boletín Estadístico del Banco Central: una fila por impuesto,
 * una columna por año desde 2005, en miles de bolivianos. La OCDE da la proporción del
 * PIB y la comparación con los vecinos; este cuadro da cuánto es en plata y el IDH, que
 * la OCDE no trata como impuesto.
 *
 * El enlace del archivo lleva la fecha del boletín (`.../2025/12/31/13_05.xlsx`) y cambia
 * con cada edición, así que se busca en la página de publicaciones en vez de fijarse.
 *
 * Los años con `p` son preliminares. Desde 2023 el cuadro reparte distinto las
 * facilidades de pago (el IUE de 2024 es 6.343 millones aquí y 7.933 en el Boletín
 * Económico de Ingresos Tributarios del Ministerio): se cita este cuadro tal cual y el
 * tablero lo dice.
 *
 * Se ejecuta con `yarn fiscal:bcb-taxes`.
 */

const FAMILY = 'recaudacion-bcb';
const PAGE = 'https://www.bcb.gob.bo/?q=pub_boletin-estadistico';
const TABLE = '13.05';

/** Etiqueta de la hoja (sin tildes ni mayúsculas) → concepto y nombre. */
const TAXES: ReadonlyArray<readonly [RegExp, string, string]> = [
  [/^total recaudaciones/u, 'TOTAL', 'Recaudación total de impuestos internos y aduana'],
  [/^valor agregado mercado interno/u, 'IVA_MERCADO_INTERNO', 'IVA del mercado interno'],
  [/^valor agregado importaciones/u, 'IVA_IMPORTACIONES', 'IVA sobre las importaciones'],
  [/^transacciones \(it\)/u, 'IT', 'Impuesto a las Transacciones (IT)'],
  [/^impuesto a las utilidades de las empresas/u, 'IUE', 'Impuesto a las Utilidades de las Empresas (IUE)'],
  [/^regimen complementario iva/u, 'RC_IVA', 'Régimen Complementario al IVA (RC-IVA)'],
  [/^consumo especifico mercado interno/u, 'ICE_MERCADO_INTERNO', 'ICE del mercado interno'],
  [/^consumo especifico importaciones/u, 'ICE_IMPORTACIONES', 'ICE sobre las importaciones'],
  [/^impuesto directo a los hidrocarburos/u, 'IDH', 'Impuesto Directo a los Hidrocarburos (IDH)'],
  [/^impuesto a los hidrocarburos y derivados/u, 'IEHD', 'Impuesto Especial a los Hidrocarburos y sus Derivados (IEHD)'],
  [/^iehd -refinerias/u, 'IEHD_REFINERIAS', 'IEHD cobrado en refinerías'],
  [/^gravamen arancelario/u, 'GRAVAMEN_ARANCELARIO', 'Gravamen Arancelario (aranceles de importación)'],
  [/^impuesto a las transacciones financieras/u, 'ITF', 'Impuesto a las Transacciones Financieras (ITF)'],
  [/^utilidades mineras/u, 'UTILIDADES_MINERAS', 'Alícuota adicional minera (UTIMIN)'],
  [/^impuesto a grandes fortunas - resident/u, 'GRANDES_FORTUNAS_RESIDENTES', 'Impuesto a las Grandes Fortunas (residentes)'],
  [/^impuesto al juego/u, 'JUEGO', 'Impuesto al Juego y participaciones en juegos'],
  [/^transmision gratuita de bienes/u, 'TGB', 'Transmisión Gratuita de Bienes (TGB)'],
  [/^regimen tributario simplificado/u, 'RTS', 'Régimen Tributario Simplificado (RTS)'],
  [/^regimen agropecuario unificado/u, 'RAU', 'Régimen Agropecuario Unificado (RAU)'],
  [/^conceptos varios/u, 'CONCEPTOS_VARIOS', 'Conceptos varios (adeudos y facilidades de pago)'],
];

const plain = (text: string): string =>
  text
    .normalize('NFD')
    .replace(/[̀-ͯ]/gu, '')
    .replace(/\s+/gu, ' ')
    .trim()
    .toLowerCase();

async function findTableUrl(): Promise<string> {
  const page = await download(PAGE);
  const html = page.bytes.toString('utf-8');
  const match = /href="([^"]*\/13_05\.xlsx)"/u.exec(html);
  if (!match?.[1]) throw new Error('el portal del BCB ya no enlaza el cuadro 13.05');
  return new URL(match[1], 'https://www.bcb.gob.bo').toString();
}

async function main(): Promise<void> {
  const source = await findTableUrl();
  const file = await download(source);
  const rows = new Workbook(file.bytes).rows(TABLE);

  const years = new Map<string, number>();
  for (const row of rows.slice(0, 8)) {
    const found = [...row.entries()].filter(([, text]) => yearOf(text) !== null);
    if (found.length >= 10) {
      for (const [column, text] of found) years.set(column, yearOf(text) as number);
      break;
    }
  }
  if (years.size < 10) throw new Error('no se encontro la fila de años del cuadro 13.05');

  const series: AccountSeries[] = [];
  const taken = new Set<string>();
  rows.forEach((row, index) => {
    // La etiqueta de un impuesto está en la columna A o, cuando la A queda en blanco, en la C.
    const label = plain(row.get('A') ?? row.get('C') ?? '');
    const taxation = TAXES.find(([pattern]) => pattern.test(label));
    if (!taxation || row.get('B') !== undefined) return;
    const [, concept, name] = taxation;
    if (taken.has(concept)) return;
    const points: Array<readonly [string, string]> = [];
    for (const [column, year] of [...years.entries()].sort((a, b) => a[1] - b[1])) {
      const value = thousandsToMillions(row.get(column));
      if (value !== null) points.push([yearDate(year), value]);
    }
    if (points.length < 3) return;
    taken.add(concept);
    series.push({
      indicatorCode: `FISC_BCB_${concept}_MM_BOB`,
      name: `${name} (millones de Bs)`,
      family: FAMILY,
      topic: 'recaudacion',
      place: 'BOL',
      concept,
      perimeter: concept === 'IDH' ? 'HIDROCARBUROS' : 'TRIBUTARIO',
      unit: 'MM_BOB',
      frequency: 'ANNUAL',
      publisher: 'Banco Central de Bolivia',
      locator: { orientation: 'rows', table: TABLE, row: index + 1, firstColumn: 'E' },
      sourceUrl: source,
      upstreamSha256: file.sha256,
      retrievedAt: file.retrievedAt,
      points,
    });
  });
  const missing = TAXES.filter(([, concept]) => !taken.has(concept)).map(([, concept]) => concept);
  if (missing.length) console.log(`  sin fila en el cuadro: ${missing.join(', ')}`);
  const path = writeFamily(FAMILY, series);
  for (const one of series) console.log(describe(one));
  console.log(`  -> ${series.length} series en ${path}`);
}

main().catch(fail);
