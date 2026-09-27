import { USER_AGENT, tableUrl } from './department-sources';
import type { SheetRow, Workbook } from './xlsx-cells';
import type { RegisterPoint } from './annual-register-shape';

/**
 * Cómo se lee un cuadro del INE: descargarlo, encontrar sus años y sus cifras.
 *
 * Separado del colector porque son dos cosas distintas. El colector sabe qué
 * significa una fila —un departamento, un producto, un agregado que no hay que
 * sumar—; esto sólo sabe abrir un cuaderno y sacar números de él, y no tiene
 * ninguna opinión sobre lo que esos números miden.
 */

const ATTEMPTS = 4;
const PAUSE_MS = 1_200;

export function sleep(milliseconds: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, milliseconds));
}

/**
 * El texto de una fila o de una cabecera, comparable con lo que este repositorio
 * escribe.
 *
 * El INE no es consistente consigo mismo entre cuadros: el mismo departamento
 * es «POTOSÍ» en las cuentas regionales y «POTOSI» en las exportaciones, y la
 * cabecera de esa segunda trae dos espacios en «DEPARTAMENTO  Y PRINCIPALES
 * PRODUCTOS». Comparar sin normalizar haría que Potosí faltara en una de las
 * dos mitades del capítulo, con todo lo demás en verde.
 */
export function normalized(text: string): string {
  return text
    .normalize('NFD')
    .replace(/[̀-ͯ]/gu, '')
    .replace(/\s+/gu, ' ')
    .trim()
    .toLocaleUpperCase('en');
}

/**
 * El año de una columna, o nada si esa columna no es un año.
 *
 * Las cabeceras traen «2017(p)» cuando la cifra es preliminar y « 2023(p)» con
 * un espacio delante, porque las escribió una persona. El «(p)» no cambia el
 * año y se retira; lo que no es un año de cuatro cifras —«Enero a Julio
 * 2026(p)»— devuelve nada y su columna entera se queda fuera, que es como este
 * corpus trata un acumulado parcial.
 */
function yearOf(header: string): string | null {
  const match = /^\s*((?:19|20)\d{2})\s*(?:\(p\))?\s*$/u.exec(header);
  return match ? (match[1] ?? null) : null;
}

/**
 * La cifra de una celda, escrita sin exponente y sin redondear.
 *
 * Los cuadernos guardan los números pequeños como «7.1919850000000007E-2», que
 * es exactamente el mismo número y no se parece en nada. Importa porque la
 * comprobación de anclaje del sembrador exige que la cifra publicada aparezca
 * literal en el registro citado, y su lector de números no entiende el
 * exponente: partiría esa celda en un «7,19…» y un «2» sueltos y declararía la
 * cifra sin fundamento.
 *
 * El punto decimal se corre con operaciones de texto y no con `Number`, para
 * que la conversión no meta un error de coma flotante donde el cuaderno no lo
 * tenía. Nada se redondea: lo que sale es el mismo valor con otra ortografía.
 */
export function plainNumber(cell: string): string | null {
  const text = cell.trim();
  if (!/^[+-]?\d+(?:\.\d+)?(?:[eE][+-]?\d+)?$/u.test(text)) return null;
  const negative = text.startsWith('-');
  const unsigned = text.replace(/^[+-]/u, '');
  const [mantissa = '', exponentText] = unsigned.split(/[eE]/u);
  const exponent = exponentText === undefined ? 0 : Number(exponentText);
  const [whole = '0', fraction = ''] = mantissa.split('.');
  const digits = `${whole}${fraction}`;
  const pointAt = whole.length + exponent;

  let plain: string;
  if (pointAt <= 0) plain = `0.${'0'.repeat(-pointAt)}${digits}`;
  else if (pointAt >= digits.length) plain = `${digits}${'0'.repeat(pointAt - digits.length)}`;
  else plain = `${digits.slice(0, pointAt)}.${digits.slice(pointAt)}`;

  const trimmed = plain.includes('.') ? plain.replace(/0+$/u, '').replace(/\.$/u, '') : plain;
  const tidy = trimmed.replace(/^0+(?=\d)/u, '');
  if (!/^\d+(?:\.\d+)?$/u.test(tidy)) return null;
  return negative && Number(tidy) !== 0 ? `-${tidy}` : tidy;
}

export async function download(
  share: string,
  what: string,
): Promise<{ bytes: Buffer; url: string }> {
  const url = tableUrl(share);
  let failure = 'sin intentos';
  for (let attempt = 1; attempt <= ATTEMPTS; attempt += 1) {
    try {
      const response = await fetch(url, {
        headers: { 'User-Agent': USER_AGENT },
        signal: AbortSignal.timeout(60_000),
      });
      if (response.ok) return { bytes: Buffer.from(await response.arrayBuffer()), url };
      failure = `respondió ${response.status}`;
    } catch (error: unknown) {
      failure = error instanceof Error ? error.message : 'fallo de red';
    }
    await sleep(PAUSE_MS * attempt * 2);
  }
  throw new Error(`${what}: la nube del INE ${failure} tras ${ATTEMPTS} intentos`);
}

/** La primera hoja del cuaderno, que es la única que los cuadros cruzados traen. */
export function firstSheet(workbook: Workbook): SheetRow[] {
  const [name] = workbook.sheetNames();
  if (!name) throw new Error('el cuaderno no declara ninguna hoja');
  return workbook.rows(name);
}

/**
 * Las columnas que llevan un año, y cuál.
 *
 * La cabecera se busca por su contenido y no por su posición: estos cuadros
 * empiezan con dos o tres líneas de título que el INE cambia de edición en
 * edición, y contar filas desde arriba es la clase de supuesto que se rompe en
 * silencio.
 */
export function yearColumns(rows: readonly SheetRow[], label: string): Map<string, string> {
  for (const row of rows) {
    const heading = [...row.values()].find((text) => normalized(text).startsWith(label));
    if (heading === undefined) continue;
    const columns = new Map<string, string>();
    for (const [column, text] of row) {
      const year = yearOf(text);
      if (year) columns.set(column, year);
    }
    if (columns.size > 0) return columns;
  }
  throw new Error(`no se encontró la cabecera «${label}» en el cuadro`);
}

/** Las lecturas de una fila, una por columna con año y con cifra. */
export function pointsOf(
  row: SheetRow,
  columns: ReadonlyMap<string, string>,
  context: Record<string, string>,
  source: { url: string; sha256: string; retrievedAt: string },
): RegisterPoint[] {
  const points: RegisterPoint[] = [];
  for (const [column, year] of columns) {
    const cell = row.get(column);
    if (cell === undefined) continue;
    const value = plainNumber(cell);
    if (value === null) continue;
    points.push({
      period: year,
      value,
      /*
       * La celda tal como el cuaderno la guarda y la misma cifra sin exponente.
       * Las dos, porque el anclaje se comprueba contra la segunda y una
       * auditoría se hace contra la primera: dejar sólo una de ellas obligaría
       * a elegir entre que la prueba sea verificable o que sea fiel.
       *
       * La segunda se llama `cifra` y no `valor` porque el validador de idioma
       * del repositorio reserva esa palabra: el extracto se escribe en
       * castellano —lo lee quien audita, no el compilador— pero la clave sigue
       * siendo un identificador de TypeScript y pasa por la misma regla.
       */
      excerpt: JSON.stringify({ ...context, anio: year, celda: cell, cifra: value }),
      sourceUrl: source.url,
      upstreamSha256: source.sha256,
      retrievedAt: source.retrievedAt,
    });
  }
  return points;
}
