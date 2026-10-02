import type { TableLayout } from './ownership-tables';

/**
 * De dónde sale quién es dueño de qué: los documentos y lo que hay que saber de
 * cada uno para leerlo.
 *
 * **Sólo documentos públicos que publica el propio emisor o su regulador.** La
 * ficha de cada emisor en la Bolsa Boliviana de Valores, los prospectos de
 * emisión que el emisor registra en ASFI y que ASFI publica, y las memorias
 * anuales de los bancos. Ninguna nota de prensa, ningún registro de terceros:
 * esto nombra a personas y una participación sin documento del emisor detrás
 * no entra. Tampoco entran familiares que el documento no nombre, ni nada de la
 * persona que no sea su nombre, su participación y la empresa: los prospectos
 * imprimen junto al nombre el carnet de identidad y la nacionalidad, y el
 * lector del cuadro no los lleva al extracto.
 *
 * **Por qué la ficha y los prospectos.** Las memorias de los bancos no son
 * pareja: la del Ganadero no trae el cuadro, la del BISA lista miles de
 * accionistas sin porcentaje y la del Económico sí lo trae. La ficha de la
 * Bolsa sí es pareja —el mismo formato para los ciento y pico emisores— pero es
 * de hoy: no guarda versiones y el archivo de Internet no tiene copias. Los
 * prospectos son la serie de tiempo: cada emisión de bonos registra el cuadro
 * de accionistas a una fecha de corte, y un banco emite casi todos los años.
 *
 * **La regla del diez por ciento.** Una pareja titular–empresa entra si algún
 * documento le atribuye al menos el diez por ciento; entonces entran todos sus
 * años, también los que quedaron por debajo, porque cortar la serie donde baja
 * del umbral haría parecer que la participación se mantuvo.
 */

export const OWNER_PREFIX = 'OWNER_STAKE_';
export const THRESHOLD = 10;
export const SEED_FILE = 'company-ownership.json';

export const BBV_PUBLISHER = 'Bolsa Boliviana de Valores S.A.';
export const ASFI_PUBLISHER = 'Autoridad de Supervisión del Sistema Financiero (ASFI)';

/** La ficha de cada emisor, que la Bolsa reescribe cada mes. */
export const fichaUrl = (code: string): string =>
  `https://www.bbv.com.bo/Media/Default/Archivos/Fichas/${code}_CAR.pdf`;

/** Un documento con su cuadro, y lo que se espera de él. */
export interface OwnershipDocument {
  /** El código del emisor en la Bolsa, sólo para agrupar el informe. */
  readonly issuer: string;
  /** La empresa cuyo capital describe el cuadro, como la escribe el documento. */
  readonly company: string;
  readonly url: string;
  readonly kind: 'prospecto' | 'memoria';
  readonly pages: readonly number[];
  /** La fecha de corte que el documento declara; se comprueba en la página. */
  readonly asOf: string;
  /** Cuántas filas con porcentaje trae el cuadro. */
  readonly rows: number;
  readonly layout?: TableLayout;
  /**
   * `false` cuando el cuadro trae acciones y porcentajes que no cuadran entre
   * sí por cómo los imprime el documento —cuota sobre otro total, cifras de
   * acciones corridas— y la comprobación de alineación no se puede usar.
   */
  readonly units?: false;
}

/** El título de un prospecto es el nombre del archivo que ASFI publica. */
export function documentTitle(url: string): string {
  const file = decodeURIComponent(url.split('/').at(-1) ?? url);
  return file.replace(/\.pdf$/iu, '').replace(/_\d$/u, '').replace(/\s+/gu, ' ').trim();
}

/**
 * Las razones sociales que los documentos escriben de otra manera que los
 * ránkings de Impuestos y de Siles, para que el cruce las encuentre.
 */
export const COMPANY_NAMES: Readonly<Record<string, string>> = {
  'Banco para el Fomento a Iniciativas Económicas S.A.': 'Banco FIE S.A.',
  'Banco Fassil S.A. en intervención': 'Banco Fassil S.A.',
  'Distribuidora de Electricidad La Paz S.A. DELAPAZ': 'Distribuidora de Electricidad La Paz S.A.',
  'Empresa Minera PAITITI S.A. EMIPA': 'Empresa Minera Paititi S.A.',
  'Santa Cruz FG Sociedad Controladora S.A. (Ex SOCIEDAD': 'Santa Cruz FG Sociedad Controladora S.A.',
};
