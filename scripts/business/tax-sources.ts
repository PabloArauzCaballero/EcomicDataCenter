import type { RollColumn, RollSegment } from './tax-roll-parse';

/**
 * Las memorias anuales del Servicio de Impuestos Nacionales y dónde está cada
 * cuadro en cada una.
 *
 * El SIN publica cada año una memoria institucional en PDF con tres cuadros
 * que el observatorio no encuentra en ninguna otra parte: el ránking de las
 * cien empresas que más impuestos pagaron, la composición del padrón de
 * contribuyentes y, desde 2021, lo recaudado por el Impuesto a las Grandes
 * Fortunas. No hay serie descargable de ninguno de los tres; están sólo aquí.
 *
 * **Qué ediciones hay.** La biblioteca de medios del sitio
 * (`/wp-json/wp/v2/media?search=memoria`, revisada el 2026-10-01) sirve de 2012
 * a 2024 y la de 2025, que es parcial: enero a octubre. **La de 2011 no está**:
 * ni en esa biblioteca ni en la página de memorias, y el archivo de Internet
 * estaba fuera de servicio al buscarla. Su ránking se reconstruye a medias con
 * la columna de comparación de la memoria 2012 (ver `collect-tax-roll`).
 *
 * **Dónde está cada cuadro.** Cada memoria tiene su maquetación y el cuadro
 * cae en otras páginas; se declaran aquí, por edición, después de mirar cada
 * PDF. Las columnas no: las lee el colector de la posición de las cifras en
 * cada página. Lo único que se declara de las columnas es qué mide cada una en
 * el cuadro del padrón, porque eso no se deduce de la geometría.
 *
 * **Cuántas filas.** El ránking trae cien por definición. El padrón trae una
 * cantidad fija por bloque en cada edición; se declara para que una fila que
 * se pierda o se parta detenga la corrida con el año y el bloque en el mensaje.
 */

export const TAX_PUBLISHER = 'Servicio de Impuestos Nacionales (SIN)';
export const TOP_PREFIX = 'TAXTOP_';
export const ROLL_PREFIX = 'TAXROLL_';
export const WEALTH_PREFIX = 'WEALTH_';

const MEDIA = 'https://www.impuestos.gob.bo/wp-content/uploads';

/** Un anexo del ránking: las mismas cien empresas agrupadas por sector o por propiedad. */
export interface TopAnnex {
  readonly pages: readonly number[];
  /** Cuántos «Total a 100» saltar en esas páginas antes de que empiece. */
  readonly after: number;
  readonly attribute: 'sector' | 'propiedad';
}

export interface TopLayout {
  readonly pages: readonly number[];
  readonly annexes?: readonly TopAnnex[];
}

export interface RollLayout {
  readonly segments: readonly RollSegment[];
  readonly columns: readonly RollColumn[];
  /** Filas por bloque: categoría, tipo de persona, departamento, once actividades, detalle. */
  readonly expected: Readonly<Record<'CAT' | 'PERSON' | 'DEPT' | 'ACT' | 'ACTD', number>>;
}

/** La página del párrafo de Grandes Fortunas y sus dos columnas de texto, en orden de lectura. */
export interface WealthLayout {
  readonly page: number;
  readonly columns: readonly (readonly [number, number])[];
}

export interface TaxEdition {
  readonly year: number;
  readonly url: string;
  readonly title: string;
  /** Lo que cubre la edición cuando no es la gestión entera. */
  readonly partial?: string;
  readonly top: TopLayout;
  readonly roll?: RollLayout;
  readonly wealth?: WealthLayout;
}

const TWO: readonly RollColumn[] = ['rollPct', 'revenuePct'];
const FOUR: readonly RollColumn[] = ['count', 'rollPct', 'revenue', 'revenuePct'];
const FULL = { CAT: 4, PERSON: 4, DEPT: 9, ACT: 12, ACTD: 14 } as const;
const CATEGORY_ONLY = { CAT: 5, PERSON: 0, DEPT: 0, ACT: 0, ACTD: 0 } as const;
const pages = (...list: number[]): RollSegment[] => list.map((page) => ({ page }));
const columnsOf = (split: number): WealthLayout['columns'] => [
  [50, split],
  [split, 600],
];

export const TAX_EDITIONS: readonly TaxEdition[] = [
  {
    year: 2012,
    url: `${MEDIA}/2024/04/MEMORIA-2012.pdf`,
    title: 'Memoria 2012',
    top: {
      pages: [26, 27, 28],
      annexes: [{ pages: [28, 29, 30, 31], after: 1, attribute: 'sector' }],
    },
  },
  {
    year: 2013,
    url: `${MEDIA}/2025/02/MEMORIA-2013.pdf`,
    title: 'Memoria 2013',
    top: {
      pages: [27, 28, 29],
      annexes: [
        { pages: [29, 30, 31, 32], after: 1, attribute: 'sector' },
        { pages: [33, 34], after: 0, attribute: 'propiedad' },
      ],
    },
    roll: { segments: [{ page: 36, band: [60, 300] }], columns: FOUR, expected: CATEGORY_ONLY },
  },
  {
    year: 2014,
    url: `${MEDIA}/2025/02/MEMORIA-2014.pdf`,
    title: 'Memoria 2014',
    top: {
      pages: [33, 34, 35],
      annexes: [
        { pages: [36, 37, 38, 39], after: 0, attribute: 'sector' },
        { pages: [40, 41, 42], after: 0, attribute: 'propiedad' },
      ],
    },
    roll: { segments: [{ page: 53, band: [80, 520] }], columns: FOUR, expected: CATEGORY_ONLY },
  },
  {
    year: 2015,
    url: `${MEDIA}/2025/02/MEMORIA-2015.pdf`,
    title: 'Memoria 2015',
    top: {
      pages: [30, 31, 32],
      annexes: [{ pages: [89, 90, 91, 92], after: 0, attribute: 'propiedad' }],
    },
    roll: { segments: pages(28, 29), columns: TWO, expected: { ...FULL, ACTD: 13 } },
  },
  {
    year: 2016,
    url: `${MEDIA}/2025/02/MEMORIA-2016.pdf`,
    title: 'Memoria Anual 2016',
    top: { pages: [31, 32, 33] },
    roll: { segments: pages(30), columns: TWO, expected: { ...FULL, ACTD: 11 } },
  },
  {
    year: 2017,
    url: `${MEDIA}/2025/02/memoria-2017-OPT-final.pdf`,
    title: 'Memoria Anual 2017',
    top: { pages: [47, 48, 49] },
    roll: { segments: pages(46), columns: TWO, expected: { ...FULL, ACTD: 10 } },
  },
  {
    year: 2018,
    url: `${MEDIA}/2025/02/memoria-2018.pdf`,
    title: 'Memoria Anual 2018',
    top: { pages: [46, 47, 48] },
    roll: { segments: pages(44, 45), columns: TWO, expected: { ...FULL, ACTD: 10 } },
  },
  {
    year: 2019,
    url: `${MEDIA}/2025/02/memoria-2019.pdf`,
    title: 'Memoria Anual 2019',
    top: { pages: [30, 31, 32, 33] },
    roll: {
      segments: [
        { page: 28, band: [100, 340] },
        { page: 28, band: [470, 760] },
        { page: 29, band: [150, 500] },
      ],
      columns: TWO,
      expected: FULL,
    },
  },
  {
    year: 2020,
    url: `${MEDIA}/2025/02/MEMORIASIN2020.pdf`,
    title: 'Memoria Anual 2020',
    top: { pages: [39, 40, 41] },
    roll: { segments: pages(37, 38), columns: TWO, expected: FULL },
  },
  {
    year: 2021,
    url: `${MEDIA}/2025/02/memoria-2021.pdf`,
    title: 'Memoria Anual 2021',
    top: { pages: [32, 33, 34] },
    roll: { segments: pages(29, 30), columns: TWO, expected: FULL },
    wealth: { page: 28, columns: columnsOf(305) },
  },
  {
    year: 2022,
    url: `${MEDIA}/2025/02/memoria-2022.pdf`,
    title: 'Memoria Anual 2022',
    top: { pages: [26, 27, 28, 29] },
    roll: { segments: pages(24, 25), columns: TWO, expected: FULL },
    wealth: { page: 24, columns: columnsOf(300) },
  },
  {
    year: 2023,
    url: `${MEDIA}/2025/09/memoria2023.pdf`,
    title: 'Memoria Anual 2023',
    top: { pages: [27, 28, 29] },
    roll: { segments: pages(25, 26), columns: TWO, expected: FULL },
    wealth: { page: 25, columns: columnsOf(315) },
  },
  {
    year: 2024,
    url: `${MEDIA}/2025/02/memoria2024-2.pdf`,
    title: 'Memoria Anual 2024',
    top: { pages: [30, 31, 32] },
    roll: { segments: pages(28, 29), columns: TWO, expected: FULL },
    wealth: { page: 28, columns: columnsOf(310) },
  },
  {
    year: 2025,
    url: `${MEDIA}/2025/11/MEMORIA-ANUAL-2025-FINAL.pdf`,
    title: 'Memoria Enero-Octubre 2025',
    partial: 'enero a octubre de 2025',
    top: { pages: [24, 25] },
    roll: { segments: pages(23), columns: TWO, expected: { ...FULL, PERSON: 2 } },
    wealth: { page: 22, columns: columnsOf(310) },
  },
];
