/**
 * Las tres referencias de riqueza contra las que se mide el tejido empresarial.
 *
 * Ninguna es boliviana y ninguna dice cuánto valen las empresas del país. Están
 * aquí porque el capítulo necesita escalas externas para leer lo que sí tiene:
 *
 * - **Forbes** publica cada año la lista de multimillonarios con su patrimonio
 *   estimado. Bolivia no tiene un solo multimillonario residente; lo que la
 *   lista sí nombra son personas nacidas en el país o de origen boliviano que
 *   hicieron su fortuna fuera. Se recogen todas las que la propia Forbes asocia
 *   con Bolivia, sin decidir a mano quién entra.
 * - **UBS** (antes Credit Suisse) estima la riqueza de los hogares por país. La
 *   única edición pública que trae a Bolivia es el Databook 2023, con la serie
 *   2000–2022 entera en una sola vintage; los informes 2024, 2025 y 2026 sólo
 *   publican 56 mercados y Bolivia no está entre ellos (comprobado el
 *   2026-10-01). UBS ya no sirve el Databook desde su sitio: la copia que se lee
 *   es la que mantiene Visual Capitalist, y su huella queda en cada punto.
 * - **Damodaran** (NYU Stern) publica cada enero el precio sobre valor en libros
 *   por industria en mercados emergentes. Es lo que permite pasar del
 *   patrimonio contable de una empresa a una banda de valor de mercado, y por
 *   eso se toman todas las industrias de todos los años archivados.
 */

export const WEALTH_PREFIX = 'WEALTH_';

const FORBES_FIELDS = [
  'uri',
  'rank',
  'personName',
  'finalWorth',
  'countryOfCitizenship',
  'country',
  'source',
  'year',
  'month',
  'bio',
  'bios',
  'abouts',
].join(',');

export const FORBES = {
  publisher: 'Forbes Media LLC',
  firstYear: 2005,
  lastYear: 2026,
  /** La lista entera de un año, con la biografía que dice de dónde es cada uno. */
  list: (year: number): string =>
    `https://www.forbes.com/forbesapi/person/billionaires/${year}/position/true.json?fields=${FORBES_FIELDS}&limit=5000`,
  /** La ficha de una persona, que es donde Forbes guarda el país de nacimiento. */
  profile: (uri: string): string => `https://www.forbes.com/forbesapi/person/${uri}.json`,
  /**
   * Por debajo de esto la respuesta no es la lista sino un error con forma de
   * lista: la de 2005, la más corta, trae 530 nombres.
   */
  minimumPerList: 400,
  /**
   * Presencias que se conocen de antemano y que la corrida tiene que volver a
   * encontrar. No son datos —el patrimonio sale siempre de la lista—: son la
   * alarma de que la búsqueda por biografía dejó de funcionar.
   */
  expected: [
    { uri: 'miguel-krigsner', from: 2014, to: 2026 },
    { uri: 'marcelo-claure', from: 2023, to: 2026 },
  ],
} as const;

/** Una columna de un cuadro del Databook: el tramo de `x` y su rótulo impreso. */
export interface DatabookColumn {
  readonly key: string;
  readonly label: string;
  readonly from: number;
  readonly to: number;
}

export const UBS = {
  url: 'https://elements.visualcapitalist.com/wp-content/uploads/2024/08/global-wealth-databook-2023-ubs.pdf',
  publisher: 'UBS Global Wealth Databook 2023 (Davies, Lluberas y Shorrocks)',
  market: 'Bolivia',
  /** El cuadro 2-2 ocupa cuatro páginas por año, de end-2000 a end-2022. */
  estimates: { firstPage: 25, step: 4, firstYear: 2000, lastYear: 2022 },
  estimateColumns: [
    { key: 'ADULTS', label: 'Adults (thousand)', from: 120, to: 190 },
    { key: 'ADULTS_SHARE', label: 'Adults (% of world)', from: 190, to: 212 },
    { key: 'TOTAL', label: 'Total wealth (USD bn)', from: 212, to: 265 },
    { key: 'TOTAL_SHARE', label: 'Total wealth (% of world)', from: 265, to: 295 },
    { key: 'MEAN', label: 'Wealth per adult (USD)', from: 295, to: 340 },
    { key: 'FINANCIAL', label: 'Financial wealth per adult (USD)', from: 340, to: 395 },
    { key: 'NONFINANCIAL', label: 'Non-financial wealth per adult (USD)', from: 395, to: 438 },
    { key: 'DEBTS', label: 'Debts per adult (USD)', from: 438, to: 478 },
    { key: 'MEDIAN', label: 'Median wealth per adult (USD)', from: 478, to: 505 },
    { key: 'METHOD', label: 'Estimation method', from: 505, to: 620 },
  ] satisfies readonly DatabookColumn[],
  /** El cuadro 3-1, la distribución por tramos, sólo para el último año. */
  pattern: { page: 123, year: 2022 },
  patternColumns: [
    { key: 'ADULTS', label: 'Adults (thousand)', from: 120, to: 195 },
    { key: 'MEAN', label: 'Mean wealth per adult (USD)', from: 195, to: 255 },
    { key: 'MEDIAN', label: 'Median wealth per adult (USD)', from: 255, to: 300 },
    { key: 'UNDER_10K', label: 'Adults under USD 10,000 (%)', from: 300, to: 350 },
    { key: 'FROM_10K_TO_100K', label: 'Adults USD 10,000-100,000 (%)', from: 350, to: 398 },
    { key: 'FROM_100K_TO_1M', label: 'Adults USD 100,000-1 million (%)', from: 398, to: 445 },
    { key: 'OVER_1M', label: 'Adults over USD 1 million (%)', from: 445, to: 485 },
    { key: 'TOTAL', label: 'Total (%)', from: 485, to: 525 },
    { key: 'GINI', label: 'Wealth Gini (%)', from: 525, to: 620 },
  ] satisfies readonly DatabookColumn[],
} as const;

/** Un archivo de múltiplos de Damodaran: el año de los datos y cuántas filas trae. */
export interface MultiplesFile {
  readonly period: string;
  readonly url: string;
  readonly rows: number;
}

const ARCHIVE = 'https://pages.stern.nyu.edu/~adamodar/pc/archives/pbvemerg';

/*
 * El sufijo del archivo es el año de los precios: `pbvemerg24` se actualizó el
 * 5 de enero de 2025 con cotizaciones de cierre de 2024. El vigente no lleva
 * sufijo y su año se comprueba contra la fecha que el propio archivo imprime.
 * No hay archivo de emergentes anterior a 2011, ni uno de América Latina.
 */
const archived = (year: number, rows: number): MultiplesFile => ({
  period: String(year),
  url: `${ARCHIVE}${String(year).slice(2)}.xls`,
  rows,
});

export const DAMODARAN = {
  publisher: 'Aswath Damodaran, NYU Stern School of Business',
  files: [
    archived(2011, 97),
    ...[2012, 2013, 2014, 2015, 2016, 2017, 2018, 2019, 2020, 2021, 2022, 2023, 2024].map((year) =>
      archived(year, 96),
    ),
    {
      period: '2025',
      url: 'https://pages.stern.nyu.edu/~adamodar/pc/datasets/pbvemerg.xls',
      rows: 96,
    },
  ] satisfies readonly MultiplesFile[],
} as const;
