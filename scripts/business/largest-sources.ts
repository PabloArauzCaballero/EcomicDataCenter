/**
 * «Las 500 empresas más grandes de Bolivia», de Hugo Siles Espada: qué
 * ediciones se pueden leer gratis y por qué, de momento, ninguna se siembra.
 *
 * El autor publica cada año ventas, utilidades, activos, pasivos y patrimonio
 * de las empresas que ordena, y el usuario decidió publicar esas cifras con su
 * atribución. La edición completa (libro impreso de 128 páginas y un Excel de
 * más de 70.000 cifras) se vende; lo gratuito es una «versión parcial». Se
 * buscó todo lo que hay el 2026-10-01:
 *
 * - **Ranking 2024** (gestión fiscal 2023; cierres: comercio, banca y
 *   electricidad al 31-dic-2023, industria y petróleo al 31-mar-2024,
 *   agroindustria al 30-jun-2024, minería al 30-sep-2023). Versión parcial en
 *   PDF, enlazada desde rankingbolivia.com: la misma copia en Heyzine y en
 *   Google Drive (huella idéntica). Trae los top 10 por ingresos, activos,
 *   utilidades y patrimonio, el primero de cada departamento y los ránkings
 *   sectoriales, pero **todos los cuadros son imágenes o texto convertido en
 *   trazos**: la capa de texto sólo tiene los títulos. No hay tabla de 500.
 *   Las cifras impresas como texto corrido (YPFB, YPFB Refinación, Alicorp en
 *   el editorial) no son un cuadro y no se leen.
 * - **Ranking 2021, 2022 y 2023** (gestiones 2020, 2021 y 2022): la portada las
 *   nombra («Versión 2021…2023») sin enlace. El flipbook de Publuu enlazado
 *   responde 410, el segundo PDF de Heyzine 404, el dominio anterior
 *   ranking500empresas.com fue tomado por un casino y el Internet Archive
 *   estaba fuera de servicio el día de la búsqueda.
 * - **Ranking 2025** (gestión 2024): presentado en noviembre de 2025 (lo
 *   reseña Economy); no hay versión gratuita publicada.
 * - **«Las 300/400 empresas»** (2018–2020, en Nueva Economía e IBCE): las
 *   páginas del IBCE son anuncios sin cuadro y el archivo de ediciones de
 *   Nueva Economía no las incluye.
 *
 * Por eso esta lista declara sólo lo que se puede bajar, con las páginas
 * donde la versión parcial imprime sus ránkings: el colector comprueba en cada
 * corrida si esas páginas ganaron capa de texto. Ese día deja de ser un hueco
 * y hay que escribir el lector de columnas; hasta entonces no se adivina una
 * cifra leyendo una imagen.
 */

/** Una edición bajable: su año de portada, la gestión que cubre y dónde mira el colector. */
export interface LargestEdition {
  readonly edition: string;
  readonly fiscalYear: string;
  readonly url: string;
  readonly mirror: string;
  /** Cuántas empresas dice ordenar la edición: el conteo esperado del cuadro. */
  readonly companies: number;
  /** Páginas (1-based) donde la versión parcial imprime sus cuadros. */
  readonly tablePages: readonly number[];
}

export const LARGEST_EDITIONS: readonly LargestEdition[] = [
  {
    edition: '2024',
    fiscalYear: '2023',
    url: 'https://cdnc.heyzine.com/files/uploaded/1ae0cf7bb0ab54bbac7bebe1b6b121dbc770987e.pdf',
    mirror: 'https://drive.google.com/uc?export=download&id=1FWOH1ixZBRUCaFyy88Jbn2PjIeNmUpmL',
    companies: 500,
    tablePages: [23, 24, 29, 30, 31, 33, 34, 35, 37, 38, 39, 40],
  },
];
