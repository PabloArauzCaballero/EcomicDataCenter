import { DEPARTMENTS } from './business-common';

/**
 * Cómo se llama cada fila de los cuadros del registro de comercio en el código.
 *
 * Los reportes de FUNDEMPRESA escriben la misma categoría de tres maneras según
 * el año y el cuadro: «Sociedad Anónima» y «Sociedad Anonima», «Sucursal de
 * Sociedad Constituida en el Extranjero» y «Sociedad Constituida en el
 * Extranjero», «Potosí» y «PTS». Las claves son las que ya usa la serie de
 * stock del registro, para que flujo y stock se crucen por código sin una tabla
 * de equivalencias en el tablero.
 */

/** Lo que el texto de una etiqueta trae, sin tildes, mayúsculas ni espacios dobles. */
export const plain = (text: string): string =>
  text
    .normalize('NFD')
    .replace(/[̀-ͯ]/gu, '')
    .toUpperCase()
    .replace(/[^A-Z0-9 ]+/gu, ' ')
    .replace(/\s+/gu, ' ')
    .trim();

/** Las abreviaturas de las cabeceras de los cuadros cruzados y los nombres enteros. */
const DEPARTMENT_SPELLINGS: Readonly<Record<string, string>> = {
  'LA PAZ': 'LA_PAZ',
  LPZ: 'LA_PAZ',
  'SANTA CRUZ': 'SANTA_CRUZ',
  SCZ: 'SANTA_CRUZ',
  COCHABAMBA: 'COCHABAMBA',
  CBB: 'COCHABAMBA',
  ORURO: 'ORURO',
  ORU: 'ORURO',
  POTOSI: 'POTOSI',
  PTS: 'POTOSI',
  TARIJA: 'TARIJA',
  TRJ: 'TARIJA',
  CHUQUISACA: 'CHUQUISACA',
  CHQ: 'CHUQUISACA',
  BENI: 'BENI',
  BEN: 'BENI',
  BNI: 'BENI',
  PANDO: 'PANDO',
  PND: 'PANDO',
};

export function departmentKey(label: string): string | undefined {
  return DEPARTMENT_SPELLINGS[plain(label)];
}

/**
 * Las formas societarias, de la más específica a la más general.
 *
 * El orden importa: «Sociedad Anónima Mixta» contiene «Sociedad Anónima» y
 * «Sociedad en Comandita por Acciones» contiene «Comandita». «Empresa Mixta» es
 * como los cuadros de inscripciones y cancelaciones llaman a la sociedad
 * anónima mixta —el de actualizaciones del mismo reporte la llama por su
 * nombre y ninguno de los dos trae las dos filas—, así que va a la misma clave.
 */
const FORM_PATTERNS: readonly (readonly [RegExp, string])[] = [
  [/UNIPERSONAL/u, 'UNIPERSONAL'],
  [/RESPONSABILIDAD LIMITADA/u, 'SRL'],
  [/ANONIMA MIXTA|EMPRESA MIXTA/u, 'SAM'],
  [/EXTRANJERO/u, 'EXTRANJERA'],
  [/COMANDITA POR ACCIONES/u, 'COMANDITA_ACCIONES'],
  [/COMANDITA SIMPLE/u, 'COMANDITA_SIMPLE'],
  [/COLECTIVA/u, 'COLECTIVA'],
  [/FINANCIERA DE VIVIENDA/u, 'EFV'],
  [/SOCIEDAD ANONIMA$/u, 'SA'],
];

export function formKey(label: string): string | undefined {
  const text = plain(label);
  return FORM_PATTERNS.find(([pattern]) => pattern.test(text))?.[1];
}

export const FORM_NAMES: Readonly<Record<string, string>> = {
  UNIPERSONAL: 'Empresa unipersonal',
  SRL: 'Sociedad de responsabilidad limitada',
  SA: 'Sociedad anónima',
  SAM: 'Sociedad anónima mixta',
  EXTRANJERA: 'Sociedad constituida en el extranjero',
  COLECTIVA: 'Sociedad colectiva',
  COMANDITA_SIMPLE: 'Sociedad en comandita simple',
  COMANDITA_ACCIONES: 'Sociedad en comandita por acciones',
  EFV: 'Entidad financiera de vivienda',
};

/**
 * Las secciones de actividad, con el nombre que la CAEB 2011 les da.
 *
 * Desde 2012 los reportes usan la CAEB 2011 (una CIIU rev. 4 adaptada); hasta
 * 2011 usaban la CIIU rev. 3, donde las mismas letras son otras ramas —la D es
 * la industria y no la electricidad, la K es inmobiliarias y no finanzas—. Por
 * eso las dos van en dimensiones distintas (`CIIU` y `CIIU3`) y nunca se unen.
 */
export const CAEB_SECTIONS: Readonly<Record<string, string>> = {
  A: 'Agricultura, ganadería, caza, pesca y silvicultura',
  B: 'Explotación de minas y canteras',
  C: 'Industria manufacturera',
  D: 'Suministro de electricidad, gas, vapor y aire acondicionado',
  E: 'Suministro de agua y gestión de desechos',
  F: 'Construcción',
  G: 'Venta por mayor y menor; reparación de vehículos',
  H: 'Transporte y almacenamiento',
  I: 'Alojamiento y servicio de comidas',
  J: 'Información y comunicaciones',
  K: 'Intermediación financiera y seguros',
  L: 'Actividades inmobiliarias',
  M: 'Servicios profesionales y técnicos',
  N: 'Servicios administrativos y de apoyo',
  O: 'Administración pública',
  P: 'Servicios de educación',
  Q: 'Salud y asistencia social',
  R: 'Actividades artísticas y recreativas',
  S: 'Otras actividades de servicios',
  T: 'Actividades de los hogares',
  U: 'Organizaciones extraterritoriales',
  X: 'Actividad no declarada',
};

export const CIIU3_SECTIONS: Readonly<Record<string, string>> = {
  A: 'Agricultura, ganadería, caza y silvicultura',
  B: 'Pesca',
  C: 'Explotación de minas y canteras',
  D: 'Industria manufacturera',
  E: 'Suministro de electricidad, gas y agua',
  F: 'Construcción',
  G: 'Comercio por mayor y menor; reparación de vehículos y enseres',
  H: 'Hoteles y restaurantes',
  I: 'Transporte, almacenamiento y comunicaciones',
  J: 'Intermediación financiera',
  K: 'Inmobiliarias, empresariales y de alquiler',
  L: 'Administración pública',
  M: 'Educación',
  N: 'Servicios sociales y de salud',
  O: 'Servicios comunitarios, sociales y personales',
  P: 'Hogares privados como empleadores',
  Q: 'Organizaciones extraterritoriales',
};

/** El nombre presentable de una clave de cualquier dimensión. */
export function keyLabel(dimension: string, key: string): string {
  if (dimension === 'TOTAL') return 'Bolivia';
  if (dimension === 'DEPT') return DEPARTMENTS[key] ?? key;
  if (dimension === 'FORM') return FORM_NAMES[key] ?? key;
  // Sin «: » dentro del nombre: el tablero toma lo anterior a «: » como la entidad.
  if (dimension === 'CIIU') return `${CAEB_SECTIONS[key] ?? key} (${key})`;
  if (dimension === 'CIIU3') return `${CIIU3_SECTIONS[key] ?? key} (${key}, CIIU rev. 3)`;
  return key;
}
