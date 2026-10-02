import {
  describe,
  download,
  fail,
  plainValue,
  writeFamily,
  yearDate,
  type AccountSeries,
} from './public-accounts-seed';

/**
 * Cuánto recauda el Estado, por tipo de impuesto, comparado con los vecinos.
 *
 * La OCDE, la CEPAL, el CIAT y el BID publican juntos las «Estadísticas tributarias de
 * América Latina y el Caribe»: la recaudación de cada país con la MISMA clasificación, de
 * modo que «bienes y servicios» de Bolivia y de Chile quieren decir lo mismo. Es la única
 * fuente que permite poner a Bolivia al lado de sus vecinos sin que la diferencia sea de
 * método. Cubre 1990 en adelante, en proporción del PIB.
 *
 * Lo que mide es el gobierno general (S13) y solo lo que la OCDE llama impuesto: las
 * contribuciones a la seguridad social entran como un tipo más, y las rentas de los
 * recursos naturales (IDH, regalías) no. Por eso el total de Bolivia aquí es menor que el
 * ingreso fiscal del Estado, que sí las cuenta; se dice en la leyenda del tablero.
 *
 * Se ejecuta con `yarn fiscal:oecd`.
 */

const PLACES: ReadonlyArray<readonly [string, string]> = [
  ['BOL', 'Bolivia'],
  ['PER', 'Perú'],
  ['CHL', 'Chile'],
  ['ARG', 'Argentina'],
  ['BRA', 'Brasil'],
  ['PRY', 'Paraguay'],
  ['COL', 'Colombia'],
  ['ECU', 'Ecuador'],
];

/** Código de la OCDE → concepto propio y nombre. */
const MEASURES: ReadonlyArray<readonly [string, string, string]> = [
  ['_T', 'TOTAL', 'Ingresos tributarios totales'],
  ['T_1000', 'RENTA', 'Impuestos a la renta, utilidades y ganancias de capital'],
  ['T_2000', 'SEGURIDAD_SOCIAL', 'Contribuciones a la seguridad social'],
  ['T_4000', 'PROPIEDAD', 'Impuestos a la propiedad'],
  ['T_5000', 'BIENES_SERVICIOS', 'Impuestos a los bienes y servicios'],
  ['T_5111', 'IVA', 'Impuesto al valor agregado'],
  ['T_5121', 'SELECTIVOS', 'Impuestos selectivos al consumo'],
  ['T_5123', 'ADUANAS', 'Derechos de aduana e importación'],
  ['T_6000', 'OTROS', 'Otros impuestos'],
];

const FAMILY = 'recaudacion-ocde';
const BASE = 'https://sdmx.oecd.org/public/rest/data/OECD.CTP.TPS,DSD_REV_COMP_LAC@DF_RSLAC,2.0';

function url(): string {
  const places = PLACES.map(([code]) => code).join('+');
  // El total (`_T`) va al final: puesto primero, el servidor de la OCDE contesta 500.
  const measures = [...MEASURES.map(([code]) => code).filter((code) => code !== '_T'), '_T'].join('+');
  return `${BASE}/${places}.TAX_REV.S13.${measures}._T.PT_B1GQ.A?format=csvfile&startPeriod=1990`;
}

async function main(): Promise<void> {
  const source = url();
  const file = await download(source);
  const lines = file.bytes.toString('utf-8').trim().split(/\r?\n/u);
  const header = (lines.shift() ?? '').split(',');
  const at = (name: string): number => {
    const index = header.indexOf(name);
    if (index < 0) throw new Error(`la OCDE ya no trae la columna ${name}`);
    return index;
  };
  const area = at('REF_AREA');
  const measure = at('STANDARD_REVENUE');
  const period = at('TIME_PERIOD');
  const value = at('OBS_VALUE');

  const cells = new Map<string, Map<number, string>>();
  for (const line of lines) {
    const columns = line.split(',');
    const year = Number(columns[period]);
    const figure = plainValue(columns[value]);
    if (!Number.isInteger(year) || figure === null) continue;
    const key = `${columns[area]}|${columns[measure]}`;
    const held = cells.get(key) ?? new Map<number, string>();
    held.set(year, figure);
    cells.set(key, held);
  }

  const series: AccountSeries[] = [];
  for (const [place, country] of PLACES) {
    for (const [code, concept, label] of MEASURES) {
      const held = cells.get(`${place}|${code}`);
      if (!held || held.size === 0) continue;
      // Los ceros del comienzo no son una medición: son un hueco que el publicador escribió
      // como número (aduanas de Brasil 1990-92) o un impuesto que todavía no existía
      // (aportes de seguridad social de Bolivia antes de 2000). Se recortan; un cero en
      // medio de la serie sí es una lectura y se queda.
      const ordered = [...held.entries()].sort(([left], [right]) => left - right);
      const firstReal = ordered.findIndex(([, figure]) => Number(figure) !== 0);
      const points = (firstReal < 0 ? [] : ordered.slice(firstReal)).map(
        ([year, figure]) => [yearDate(year), figure] as const,
      );
      if (points.length === 0) continue;
      series.push({
        indicatorCode: `FISC_OECD_${place}_${concept}_PCT_GDP`,
        name: `${label} (% del PIB) · ${country}`,
        family: FAMILY,
        topic: 'recaudacion',
        place,
        concept,
        perimeter: 'GG',
        unit: 'PCT_GDP',
        frequency: 'ANNUAL',
        publisher: 'OCDE · CEPAL · CIAT · BID',
        locator: { dataflow: 'DF_RSLAC', refArea: place, standardRevenue: code, sector: 'S13' },
        sourceUrl: source,
        upstreamSha256: file.sha256,
        retrievedAt: file.retrievedAt,
        points,
      });
    }
  }
  const path = writeFamily(FAMILY, series);
  for (const one of series.filter((entry) => entry.place === 'BOL')) console.log(describe(one));
  console.log(`  -> ${series.length} series en ${path}`);
}

main().catch(fail);
