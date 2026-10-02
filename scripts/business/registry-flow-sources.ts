/**
 * De dónde salen los flujos del registro de comercio: quién entra, quién
 * renueva y quién se va, año por año.
 *
 * **Dos concesiones, una sola definición de cada flujo.** Hasta marzo de 2022
 * el registro lo administró FUNDEMPRESA por concesión; desde abril lo lleva el
 * SEPREC. Los dos cuentan la inscripción como la primera matrícula de una
 * empresa y la actualización —o renovación— como la matrícula puesta al día en
 * la gestión, así que la serie sigue con el mismo código y su `basis` dice qué
 * años publica cada uno. Lo que no se une: la «Base Empresarial» de los
 * reportes hasta 2011 —las empresas con matrícula al día más las nuevas, que es
 * una base *activa*— y la «Base Empresarial Vigente» posterior —todas las no
 * canceladas—. La primera entra aquí como `FIRMS_ACTIVE_…`; la segunda es el
 * stock que lleva otro colector.
 *
 * **Qué documento manda en cada año.** El reporte estadístico de diciembre de
 * un año trae ese año entero; sus cuadros «por gestión» traen además los cinco
 * anteriores. Una cifra se toma del reporte de su propio año cuando existe y,
 * si no, del reporte más reciente que la traiga: el de diciembre de 2021 es el
 * que cubre 2016-2020 cuando falta el propio.
 *
 * **Por qué el archivo de Internet.** El sitio de FUNDEMPRESA responde 410
 * desde que la concesión terminó. Las copias de web.archive.org con el sufijo
 * `id_` devuelven el PDF tal como se archivó, con su huella original.
 */

export type Measure = 'NEW' | 'RENEWED' | 'CANCELLED' | 'ACTIVE';
export type Dimension = 'DEPT' | 'FORM' | 'CIIU' | 'CIIU3';

/** Un cuadro de un reporte de FUNDEMPRESA, con lo que debe dar. */
export interface FlowTable {
  readonly measure: Measure;
  /** La dimensión de las filas; en un cuadro cruzado, las columnas son departamentos. */
  readonly dimension: Dimension;
  /** Años en columnas, una sola columna de cantidad, o los nueve departamentos y su TOTAL. */
  readonly columns: 'years' | 'single' | 'departments';
  /** El título del cuadro, sin el «Bolivia:» que lo encabeza. */
  readonly title: RegExp;
  /** Cuántas filas con categoría trae, sin contar el TOTAL. */
  readonly rows: number;
}

/** Un reporte de FUNDEMPRESA y los cuadros que se leen de él. */
export interface FundempresaReport {
  /** La gestión que el reporte cierra: la de sus cuadros de una sola columna. */
  readonly year: string;
  readonly edition: string;
  readonly url: string;
  readonly tables: readonly FlowTable[];
  /** Si el reporte nombra en una frase los municipios con más empresas de cada flujo. */
  readonly municipalities?: boolean;
}

export const FUNDEMPRESA = 'FUNDEMPRESA (concesionaria del Registro de Comercio de Bolivia)';
export const SEPREC = 'Servicio Plurinacional de Registro de Comercio (SEPREC)';

const wayback = (stamp: string, url: string): string => `https://web.archive.org/web/${stamp}id_/${url}`;

/* Los títulos se escriben con \S donde va una tilde: varias ediciones traen la
 * fuente mal incrustada y la «ó» llega como otro carácter. */
const T = {
  newByYear: (dim: string) => new RegExp(`Inscripci\\S+n de empresas por gesti\\S+n seg\\S+n ${dim}, \\d{4}`, 'u'),
  cancelledByYear: (dim: string) => new RegExp(`Matr\\S+culas canceladas por gesti\\S+n seg\\S+n ${dim}, \\d{4}`, 'u'),
  renewed: (dim: string) => new RegExp(`Actualizaci\\S+n de empresas seg\\S+n ${dim}`, 'u'),
};

/** El molde de los reportes de diciembre desde 2016: seis años por cuadro y la actualización del año. */
const modernTables = (forms: { readonly new: number; readonly renewed: number; readonly cancelled: number }): FlowTable[] => [
  { measure: 'NEW', dimension: 'DEPT', columns: 'years', title: T.newByYear('departamento'), rows: 9 },
  { measure: 'NEW', dimension: 'FORM', columns: 'years', title: T.newByYear('tipo societario'), rows: forms.new },
  { measure: 'NEW', dimension: 'CIIU', columns: 'years', title: T.newByYear('actividad econ\\S+mica'), rows: 18 },
  { measure: 'NEW', dimension: 'CIIU', columns: 'departments', title: /Inscripci\S+n de empresas por departamento seg\S+n actividad/u, rows: 18 },
  { measure: 'RENEWED', dimension: 'DEPT', columns: 'single', title: T.renewed('departamento'), rows: 9 },
  { measure: 'RENEWED', dimension: 'FORM', columns: 'single', title: T.renewed('tipo societario'), rows: forms.renewed },
  { measure: 'RENEWED', dimension: 'CIIU', columns: 'single', title: T.renewed('actividad econ\\S+mica'), rows: 18 },
  { measure: 'RENEWED', dimension: 'CIIU', columns: 'departments', title: /Actualizaci\S+n de empresas por departamento seg\S+n actividad/u, rows: 18 },
  { measure: 'CANCELLED', dimension: 'DEPT', columns: 'years', title: T.cancelledByYear('departamento'), rows: 9 },
  { measure: 'CANCELLED', dimension: 'FORM', columns: 'years', title: T.cancelledByYear('tipo societario'), rows: forms.cancelled },
  { measure: 'CANCELLED', dimension: 'CIIU', columns: 'years', title: T.cancelledByYear('actividad econ\\S+mica'), rows: 18 },
  { measure: 'CANCELLED', dimension: 'CIIU', columns: 'departments', title: /Matr\S+culas canceladas por departamento seg\S+n actividad/u, rows: 18 },
];

/**
 * El reporte de diciembre de 2010 trae la base activa de 2002 a 2010 y las
 * inscripciones y cancelaciones de 2005 a 2010, con la actividad en CIIU rev. 3.
 * La copia que queda en línea es la edición departamental de Oruro, que repite
 * los cuadros nacionales («Bolivia: …») antes de abrir los del departamento; la
 * guarda la Facultad de Ciencias Económicas de la UMSA y es el PDF de FUNDEMPRESA
 * sin tocar. Los cuadros «Oruro: …» no se leen.
 */
const report2010: FundempresaReport = {
  year: '2010',
  edition: 'Estadísticas del Registro de Comercio de Bolivia, departamento de Oruro, diciembre de 2010',
  url: 'http://www.docentes.fcefa.edu.bo/wp-content/uploads/sites/9/2013/09/ESTADISTICAS-FUNDENPRESA-ORURODerecho-Comercial-417.pdf',
  tables: [
    { measure: 'ACTIVE', dimension: 'DEPT', columns: 'years', title: /Base Empresarial por departamento, 2002/u, rows: 9 },
    { measure: 'ACTIVE', dimension: 'FORM', columns: 'years', title: /Base Empresarial por gesti\S+n seg\S+n tipo societario, 2002/u, rows: 7 },
    { measure: 'ACTIVE', dimension: 'CIIU3', columns: 'years', title: /Base Empresarial por gesti\S+n seg\S+n actividad econ\S+mica, 2005/u, rows: 15 },
    { measure: 'ACTIVE', dimension: 'CIIU3', columns: 'departments', title: /Base Empresarial por departamento seg\S+n actividad econ\S+mica, 2010/u, rows: 14 },
    { measure: 'NEW', dimension: 'DEPT', columns: 'years', title: /Registro de nuevas empresas por gesti\S+n seg\S+n departamento, 2005/u, rows: 9 },
    { measure: 'CANCELLED', dimension: 'DEPT', columns: 'years', title: /Matr\S+culas canceladas por gesti\S+n seg\S+n departamento, 2005/u, rows: 9 },
  ],
};

export const FUNDEMPRESA_REPORTS: readonly FundempresaReport[] = [
  report2010,
  {
    year: '2021',
    edition: 'Estadísticas del Registro de Comercio de Bolivia, diciembre de 2021',
    url: wayback(
      '20220210150944',
      'https://www.fundempresa.org.bo/docs/news/es/113_reporte-estadistico-al-mes-de-diciembre-2021-1.pdf',
    ),
    tables: modernTables({ new: 8, renewed: 9, cancelled: 8 }),
    municipalities: true,
  },
];

/** Los mensuales del SEPREC: el de noviembre de 2025 es el último publicado. */
export const SEPREC_MONTHLY = {
  edition: 'Información estadística a noviembre de 2025',
  newUrl: 'https://www.seprec.gob.bo/wp-content/uploads/2025/12/Informacion-ESTADISTICA-WEB-NUEVAS-NOV_v1.pdf',
  renewedUrl: 'https://www.seprec.gob.bo/wp-content/uploads/2025/12/Informacion-ESTADISTICA-WEB-RENOV-NOV_v1.pdf',
  /** Cuántas gestiones resume cada uno: 2022 a 2025. */
  years: 4,
} as const;

/** La memoria trae la única cifra de inscripciones de 2022 entero; sus cuadros son imágenes. */
export const SEPREC_MEMORY = {
  edition: 'Memoria Anual Institucional, gestión 2022-2025',
  url: 'https://www.seprec.gob.bo/wp-content/uploads/2025/12/Memoria-2022-2025_v1.pdf',
  pages: [34],
} as const;
