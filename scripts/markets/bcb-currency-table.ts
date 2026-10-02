/**
 * La tabla de cotizaciones del Banco Central de Bolivia, moneda por moneda.
 *
 * `parseBcbQuotationTable` (el del recolector diario) lee de esa misma tabla
 * sólo el dólar y la UFV. Aquí se leen todas las filas: veintiuna monedas con
 * lo que vale cada una en bolivianos y cuántas entran en un dólar.
 *
 * La tabla viene en dos formas según de dónde se pida: la de «último» declara
 * `FECHA DE LA COTIZACIÓN: 1 de Octubre 2026` y la que se pide por fecha dice
 * `TABLA DE COTIZACIONES DEL 28 DE SEPTIEMBRE DE 2026`. Un domingo se pide y
 * contesta con la tabla del lunes: por eso la fecha que cuenta es la que la
 * página dice de sí misma y no la que se pidió.
 */

export interface CurrencyRow {
  readonly iso: string;
  readonly country: string;
  readonly currency: string;
  /** Bolivianos por una unidad de la moneda, tal como el BCB lo escribe. */
  readonly bobPerUnit: string;
  /** Unidades de la moneda por un dólar; vacío en la fila del dólar. */
  readonly perUsd: string | null;
  /** La fila como se lee en pantalla: sirve de prueba de la cifra. */
  readonly excerpt: string;
}

export interface CurrencyTable {
  readonly effectiveDate: string;
  readonly officialUsd: string;
  readonly rows: readonly CurrencyRow[];
}

const MONTHS = new Map([
  ['enero', 1],
  ['febrero', 2],
  ['marzo', 3],
  ['abril', 4],
  ['mayo', 5],
  ['junio', 6],
  ['julio', 7],
  ['agosto', 8],
  ['septiembre', 9],
  ['setiembre', 9],
  ['octubre', 10],
  ['noviembre', 11],
  ['diciembre', 12],
]);

const ENTITIES: Record<string, string> = {
  Aacute: 'Á', Eacute: 'É', Iacute: 'Í', Oacute: 'Ó', Uacute: 'Ú', Ntilde: 'Ñ',
  aacute: 'á', eacute: 'é', iacute: 'í', oacute: 'ó', uacute: 'ú', ntilde: 'ñ',
  nbsp: ' ', amp: '&',
};

const decode = (text: string): string =>
  text
    .replace(/&([A-Za-z]+);/gu, (whole, name: string) => ENTITIES[name] ?? whole)
    .replace(/\s+/gu, ' ')
    .trim();

/** Fecha que la página declara de sí misma, en las dos formas que usa. */
function effectiveDateOf(html: string): string {
  const flat = decode(html.replace(/<[^>]*>/gu, ' '));
  const found =
    /FECHA DE LA COTIZACI.N:\s*(\d{1,2}) de ([\p{L}]+) (\d{4})/iu.exec(flat) ??
    /TABLA DE COTIZACIONES DEL (\d{1,2}) DE ([\p{L}]+) DE (\d{4})/iu.exec(flat);
  const month = found?.[2] ? MONTHS.get(found[2].toLocaleLowerCase('es')) : undefined;
  if (!found?.[1] || !found[3] || !month) {
    throw new Error('la tabla del BCB no declara una fecha reconocible');
  }
  return `${found[3]}-${String(month).padStart(2, '0')}-${found[1].padStart(2, '0')}`;
}

const CELL = String.raw`<td[^>]*>([^<]*)</td>\s*`;
const ROW = new RegExp(`<tr[^>]*>\\s*${CELL}${CELL}${CELL}${CELL}(?:${CELL})?</tr>`, 'giu');

const asNumber = (text: string): string | null => {
  const clean = text.replace(/,/gu, '').trim();
  return /^\d+(?:\.\d+)?$/u.test(clean) ? clean : null;
};

export function parseCurrencyTable(html: string): CurrencyTable {
  const effectiveDate = effectiveDateOf(html);
  const rows: CurrencyRow[] = [];
  let officialUsd = '';
  for (const match of html.matchAll(ROW)) {
    const [, country, currency, code, first, second] = match.map((cell) => decode(cell ?? ''));
    if (!country || !currency || !code || !/^[A-Z]{3}$/u.test(code)) continue;
    const bobPerUnit = asNumber(first ?? '');
    if (!bobPerUnit) continue;
    const perUsd = second ? asNumber(second) : null;
    if (code === 'USD') officialUsd = bobPerUnit;
    rows.push({
      iso: code,
      country,
      currency,
      bobPerUnit,
      perUsd,
      excerpt: [country, currency, code, first, second].filter(Boolean).join(' | '),
    });
  }
  if (!officialUsd) throw new Error('la tabla del BCB no trae la fila del dólar');
  return { effectiveDate, officialUsd, rows };
}

/**
 * Una fila es coherente si Bs por unidad × unidades por dólar devuelve el
 * dólar oficial de esa tabla. Falla por un decimal corrido o una fila de otra
 * moneda, que es como se estropea una tabla escrita a mano.
 */
export function coherent(row: CurrencyRow, officialUsd: string): boolean {
  if (row.iso === 'USD') return true;
  if (!row.perUsd) return false;
  const implied = Number(row.bobPerUnit) * Number(row.perUsd);
  return Math.abs(implied / Number(officialUsd) - 1) < 0.02;
}
