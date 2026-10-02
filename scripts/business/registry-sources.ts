/**
 * De dónde sale la base empresarial y cómo se nombra cada una de sus filas.
 *
 * Dos publicaciones del mismo registro, y no son intercambiables:
 *
 * - **El SIIP del Ministerio de Desarrollo Productivo** sirve la serie larga
 *   —cierre de cada gestión desde 2008— por tipo societario, departamento y
 *   actividad, desde un JSON sin autenticación que su propia página consume.
 *   Es la única fuente con la historia entera.
 * - **El reporte mensual del SEPREC**, el registro mismo desde abril de 2022.
 *   Es la cifra que el registro reconoce como suya.
 *
 * Las dos coinciden hasta 2024 y se separan en 2025: el SIIP publica 470.077
 * empresas para 2025 y el SEPREC, en su reporte de noviembre de 2025, 398.131.
 * Un salto del 21 % en un año en el que el propio registro informa 14.752
 * inscripciones no es crecimiento, y no hay nota en el SIIP que lo explique.
 * Por eso la serie toma del SIIP sólo los cierres 2008-2024 y el punto de 2025
 * sale del reporte del SEPREC, con su mes en la base. La columna de 2026 del
 * SIIP es un corte a febrero y se descarta por la misma regla que el INE: un
 * año a medias dibujado en una serie anual miente.
 */

export const SIIP_URL = 'https://siip.produccion.gob.bo/repSIIP2/JsonAjaxFundempresa.php';
export const SIIP_PAGE = 'https://siip.produccion.gob.bo/repSIIP2/formSeprec.php';
export const SIIP_PUBLISHER =
  'Ministerio de Desarrollo Productivo y Economía Plural (SIIP), con datos del SEPREC';
/** El último cierre de gestión que el SIIP y el SEPREC sostienen a la vez. */
export const SIIP_LAST_YEAR = 2024;
/** El corte con el que la página del SIIP se consulta hoy. */
export const SIIP_CUT = { gestion: '2026', mes: '2' } as const;

export const SEPREC_PUBLISHER = 'Servicio Plurinacional de Registro de Comercio (SEPREC)';
/** El reporte más reciente con la base empresarial abierta por todas sus dimensiones. */
export const SEPREC_STOCK_REPORT = {
  url: 'https://www.seprec.gob.bo/wp-content/uploads/2025/12/Informacion-ESTADISTICA-WEB-NOV_v1.pdf',
  period: '2025',
  cut: 'noviembre de 2025',
  total: '398131',
} as const;

/** Los valores que el SIIP acepta como departamento, con su código en el corpus. */
export const SIIP_PLACES: Readonly<Record<string, string>> = {
  BOLIVIA: 'BOLIVIA',
  CHUQUISACA: 'CHUQUISACA',
  'LA PAZ': 'LA_PAZ',
  COCHABAMBA: 'COCHABAMBA',
  ORURO: 'ORURO',
  POTOSI: 'POTOSI',
  TARIJA: 'TARIJA',
  'SANTA CRUZ': 'SANTA_CRUZ',
  BENI: 'BENI',
  PANDO: 'PANDO',
};

/**
 * Los tipos societarios del Código de Comercio, con una clave corta.
 *
 * La clave es la que comparten todas las series del capítulo —el stock, las
 * inscripciones y las cancelaciones—, así que no puede depender de cómo
 * escribe el nombre cada publicación: el SIIP dice «SOCIEDAD ANONIMA MIXTA» y
 * el SEPREC «Sociedad Anónima Mixta» partido en dos renglones.
 */
export const LEGAL_FORMS: readonly { key: string; label: string; pattern: RegExp }[] = [
  { key: 'UNIPERSONAL', label: 'Empresa unipersonal', pattern: /UNIPERSONAL/u },
  {
    key: 'SRL',
    label: 'Sociedad de responsabilidad limitada',
    pattern: /RESPONSABILIDAD/u,
  },
  { key: 'SAM', label: 'Sociedad anónima mixta', pattern: /AN[OÓ]NIMA\s+MIXTA/u },
  { key: 'SA', label: 'Sociedad anónima', pattern: /AN[OÓ]NIMA/u },
  {
    key: 'EXTRANJERA',
    label: 'Sociedad constituida en el extranjero',
    pattern: /EXTRANJERO/u,
  },
  { key: 'COLECTIVA', label: 'Sociedad colectiva', pattern: /COLECTIVA/u },
  {
    key: 'COMANDITA_ACCIONES',
    label: 'Sociedad en comandita por acciones',
    pattern: /COMANDITA\s+POR\s+ACCIONES/u,
  },
  { key: 'COMANDITA_SIMPLE', label: 'Sociedad en comandita simple', pattern: /COMANDITA/u },
  { key: 'EFV', label: 'Entidad financiera de vivienda', pattern: /VIVIENDA/u },
  {
    key: 'PUBLICA_DEPARTAMENTAL',
    label: 'Empresa pública departamental mixta',
    pattern: /P[UÚ]BLICA/u,
  },
];

/**
 * Las ligaduras «ti» y «tí» de la fuente del SEPREC, y las vocales acentuadas que un PDF con la fuente mal declarada entrega como
 * caracteres de Mac Roman: el reporte del SEPREC escribe «AnÛnima» y «PotosÌ».
 * Son las mismas posiciones de byte en las dos tablas; se devuelven a su letra
 * sólo dentro de una palabra, para no tocar una raya o unos puntos suspensivos.
 */
const MAC_ROMAN: Readonly<Record<string, string>> = {
  '·': 'á',
  È: 'é',
  Ì: 'í',
  Û: 'ó',
  '˙': 'ú',
  Ò: 'ñ',
  '¸': 'ü',
};

export function repairAccents(printed: string): string {
  return printed
    .replace(/Ɵ/gu, 'ti')
    .replace(/ơ/gu, 'tí')
    .replace(/(?<=\p{L})[·ÈÌÛ˙Ò¸]|[·ÈÌÛ˙Ò¸](?=\p{L})/gu, (glyph) => MAC_ROMAN[glyph] ?? glyph);
}

/** La clave de un tipo societario escrito como sea. */
export function legalForm(printed: string): { key: string; label: string } {
  const upper = repairAccents(printed).normalize('NFC').toUpperCase().replace(/\s+/gu, ' ');
  const found = LEGAL_FORMS.find((form) => form.pattern.test(upper));
  if (!found) throw new Error(`tipo societario desconocido: «${printed}»`);
  return found;
}

/**
 * Las secciones de la CIIU rev. 4 que el registro usa, con una forma de
 * reconocerlas en el texto del SEPREC, que no imprime la letra.
 */
export const ACTIVITIES: readonly { key: string; label: string; pattern: RegExp }[] = [
  { key: 'A', label: 'Agricultura, ganadería, caza, pesca y silvicultura', pattern: /AGRICULTURA/u },
  { key: 'B', label: 'Explotación de minas y canteras', pattern: /MINAS/u },
  { key: 'C', label: 'Industria manufacturera', pattern: /MANUFACTURERA/u },
  { key: 'D', label: 'Electricidad, gas, vapor y aire acondicionado', pattern: /ELECTRICIDAD/u },
  { key: 'E', label: 'Agua, saneamiento y gestión de desechos', pattern: /AGUA/u },
  { key: 'F', label: 'Construcción', pattern: /CONSTRUCCI/u },
  { key: 'G', label: 'Comercio y reparación de vehículos', pattern: /VENTA|COMERCIO/u },
  { key: 'H', label: 'Transporte y almacenamiento', pattern: /TRANSPORTE/u },
  { key: 'I', label: 'Alojamiento y servicio de comidas', pattern: /ALOJAMIENTO/u },
  { key: 'J', label: 'Información y comunicaciones', pattern: /INFORMACI/u },
  { key: 'K', label: 'Intermediación financiera y seguros', pattern: /FINANCIERA/u },
  { key: 'L', label: 'Actividades inmobiliarias', pattern: /INMOBILIARIA/u },
  { key: 'M', label: 'Servicios profesionales y técnicos', pattern: /PROFESIONALES/u },
  { key: 'N', label: 'Servicios administrativos y de apoyo', pattern: /ADMINISTRA/u },
  { key: 'P', label: 'Educación', pattern: /EDUCACI/u },
  { key: 'Q', label: 'Salud y asistencia social', pattern: /SALUD/u },
  { key: 'R', label: 'Artes, entretenimiento y recreación', pattern: /ART[IÍ]STICA|ENTRETENIMIENTO/u },
  { key: 'S', label: 'Otras actividades de servicios', pattern: /OTRAS ACTIVIDADES/u },
  { key: 'X', label: 'Actividad no declarada', pattern: /NO DECLARADA/u },
];

/**
 * La sección de una actividad escrita como sea.
 *
 * El SEPREC imprime con una fuente que convierte «ti» en una ligadura
 * —«AcƟvidades arơsƟcas»—; `repairAccents` la deshace antes de reconocer el
 * texto.
 */
export function activity(printed: string): { key: string; label: string } {
  const letter = /^([A-Sx])\s+-\s+/u.exec(printed)?.[1];
  if (letter) {
    const byLetter = ACTIVITIES.find((one) => one.key === letter.toUpperCase());
    if (byLetter) return byLetter;
  }
  const upper = repairAccents(printed)
    .normalize('NFD')
    .replace(/[̀-ͯ]/gu, '')
    .toUpperCase();
  const plain = (pattern: RegExp): RegExp =>
    new RegExp(pattern.source.normalize('NFD').replace(/[̀-ͯ]/gu, ''), 'u');
  const found = ACTIVITIES.find((one) => plain(one.pattern).test(upper));
  if (!found) throw new Error(`actividad desconocida: «${printed}»`);
  return found;
}
