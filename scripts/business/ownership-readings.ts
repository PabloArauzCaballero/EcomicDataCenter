import { companyIdentity, download } from './business-common';
import { pdfRows, type PdfRow } from './pdf-rows';
import { readStakeTable, type StakeTable } from './ownership-tables';
import {
  ASFI_PUBLISHER,
  BBV_PUBLISHER,
  COMPANY_NAMES,
  documentTitle,
  fichaUrl,
  type OwnershipDocument,
} from './ownership-sources';

/**
 * Cada documento leído y comprobado, reducido a una lectura por fila.
 *
 * Tres comprobaciones antes de aceptar un cuadro, y las tres detienen la
 * corrida con el documento en el mensaje: que tenga las filas declaradas, que
 * la fecha de corte declarada esté impresa en la página y que cada porcentaje
 * cuadre con sus acciones cuando el cuadro trae las dos columnas. La tercera es
 * la que atrapa un cuadro desalineado, que es el fallo que la suma no ve: si el
 * porcentaje de cada fila se corre un renglón la suma sigue dando cien.
 */

export interface Reading {
  readonly companySlug: string;
  readonly companyName: string;
  readonly holder: string;
  readonly printed: string;
  readonly asOf: string;
  readonly excerpt: string;
  readonly sourceUrl: string;
  readonly upstreamSha256: string;
  readonly retrievedAt: string;
  readonly publisher: string;
}

/** Lo que el informe cuenta de cada documento. */
export interface DocumentReport {
  readonly label: string;
  readonly rows: number;
  readonly listed: number;
  readonly asOf: string;
}

const MONTHS = ['ene', 'feb', 'mar', 'abr', 'may', 'jun', 'jul', 'ago', 'sep', 'oct', 'nov', 'dic'];

/** Todas las fechas impresas en la página, en ISO: «31 de agosto de 2013», «30/06/2015», «31AGO2026». */
export function printedDates(text: string): Set<string> {
  const found = new Set<string>();
  const iso = (year: string, month: number, day: string): string =>
    `${year}-${String(month).padStart(2, '0')}-${day.padStart(2, '0')}`;
  for (const match of text.matchAll(/(\d{1,2})\s+de\s+([a-záéíóú]+)\s+(?:de|del)\s+(\d{4})/giu)) {
    const month = MONTHS.indexOf((match[2] ?? '').toLowerCase().slice(0, 3)) + 1;
    if (month > 0) found.add(iso(match[3] ?? '', month, match[1] ?? ''));
  }
  for (const match of text.matchAll(/(\d{1,2})[/.-](\d{1,2})[/.-](\d{4})/gu)) {
    found.add(iso(match[3] ?? '', Number(match[2]), match[1] ?? ''));
  }
  for (const match of text.matchAll(/(\d{2})([A-Z]{3})(\d{4})/gu)) {
    const month = MONTHS.indexOf((match[2] ?? '').toLowerCase()) + 1;
    if (month > 0) found.add(iso(match[3] ?? '', month, match[1] ?? ''));
  }
  return found;
}

const companyOf = (published: string): { slug: string; name: string } =>
  companyIdentity(COMPANY_NAMES[published] ?? published);

/** El porcentaje como el corpus lo guarda: el documento usa coma o punto decimal, nunca separador de miles. */
export const shareValue = (printed: string): string => printed.replace(/[%\s]/gu, '').replace(',', '.');

/**
 * Cada porcentaje cuadra con sus acciones. La holgura es la del redondeo
 * impreso con un piso de cinco centésimas: hay cuadros cuya fila «Otros» se
 * ajusta a mano para que la suma dé cien. Un cuadro corrido falla por mucho
 * más, porque cada fila hereda la cuota de su vecina.
 */
function checkAlignment(table: StakeTable, label: string): void {
  if (!table.totalUnits) return;
  for (const line of table.lines) {
    if (line.units === undefined) continue;
    const decimals = (shareValue(line.printed).split('.')[1] ?? '').length;
    const tolerance = Math.max(0.6 * 10 ** -decimals + 0.01, 0.05);
    const implied = (line.units / table.totalUnits) * 100;
    if (Math.abs(implied - line.share) > tolerance) {
      throw new Error(`${label}: «${line.holder}» imprime ${line.printed} y sus acciones dan otra cuota; el cuadro está desalineado`);
    }
  }
}

/**
 * Un titular con una cifra larga pegada es un carnet de identidad o un NIT que
 * se coló en la columna del nombre: el cuadro está mal cortado y ese número no
 * puede llegar al corpus. Una fila sin titular es el mismo corte mal hecho del
 * otro lado: el nombre quedó fuera de su columna.
 */
function checkNames(table: StakeTable, label: string): void {
  const leaked = table.lines.find((line) => /\d{5,}/u.test(line.holder));
  if (leaked) throw new Error(`${label}: el titular «${leaked.holder.slice(0, 30)}…» trae un número de documento`);
  const nameless = table.lines.find((line) => !/\p{L}{2}/u.test(line.holder));
  if (nameless) throw new Error(`${label}: una fila de ${nameless.printed} no trae titular`);
}

function readingsOf(
  table: StakeTable,
  context: { company: string; asOf: string; title: string; url: string; publisher: string; sha: string; at: string },
): Reading[] {
  const { slug, name } = companyOf(context.company);
  return table.lines.map((line) => ({
    companySlug: slug,
    companyName: name,
    holder: line.holder,
    printed: line.printed,
    asOf: context.asOf,
    excerpt: `${context.title}. Cuadro de accionistas de ${context.company} al ${context.asOf}: ${table.header} — ${line.text}`,
    sourceUrl: context.url,
    upstreamSha256: context.sha,
    retrievedAt: context.at,
    publisher: context.publisher,
  }));
}

/** La razón social de la ficha es el primer renglón pegado al margen izquierdo. */
const fichaCompany = (rows: readonly PdfRow[]): string =>
  rows.find((row) => (row.glyphs[0]?.x ?? 99) < 40)?.glyphs[0]?.text ?? '';

/** La ficha de la Bolsa: la fecha y la empresa salen de la propia ficha. */
export async function readFicha(
  code: string,
  expected: number,
  checkUnits = true,
): Promise<{ readings: Reading[]; report: DocumentReport }> {
  const url = fichaUrl(code);
  const document = await download(url);
  const rows = await pdfRows(document.bytes);
  const stamp = rows.find((row) => row.text.startsWith('Información al:'))?.text ?? '';
  const asOf = [...printedDates(stamp)][0];
  const table = readStakeTable(rows);
  if (!asOf || !table) throw new Error(`ficha ${code}: sin fecha de corte o sin cuadro de accionistas`);
  if (table.lines.length !== expected) {
    throw new Error(`ficha ${code} al ${asOf}: ${table.lines.length} filas y se esperaban ${expected}`);
  }
  if (checkUnits) checkAlignment(table, `ficha ${code}`);
  checkNames(table, `ficha ${code}`);
  const company = fichaCompany(rows);
  const readings = readingsOf(table, {
    company,
    asOf,
    title: `Ficha del emisor ${company} en la Bolsa Boliviana de Valores, información al ${stamp.slice(16, 25)}`,
    url,
    publisher: BBV_PUBLISHER,
    sha: document.sha256,
    at: document.retrievedAt,
  });
  return { readings, report: { label: `ficha ${code}`, rows: table.lines.length, listed: sumOf(table), asOf } };
}

const sumOf = (table: StakeTable): number => table.lines.reduce((sum, line) => sum + line.share, 0);

/** Un prospecto o una memoria con su cuadro en las páginas declaradas. */
export async function readDocument(source: OwnershipDocument): Promise<{ readings: Reading[]; report: DocumentReport }> {
  const label = `${source.issuer} ${documentTitle(source.url)} p${source.pages.join('-')}`;
  const document = await download(source.url);
  const rows = await pdfRows(document.bytes, source.pages);
  if (!printedDates(rows.map((row) => row.text).join('\n')).has(source.asOf)) {
    throw new Error(`${label}: la fecha de corte ${source.asOf} no está impresa en la página`);
  }
  const table = readStakeTable(rows, source.layout);
  if (!table) throw new Error(`${label}: no se encontró el cuadro de accionistas`);
  if (table.lines.length !== source.rows) {
    throw new Error(`${label}: ${table.lines.length} filas y se esperaban ${source.rows}`);
  }
  if (source.units !== false) checkAlignment(table, label);
  checkNames(table, label);
  const kind = source.kind === 'prospecto' ? 'Prospecto registrado en ASFI' : 'Memoria anual';
  const readings = readingsOf(table, {
    company: source.company,
    asOf: source.asOf,
    title: `${kind} «${documentTitle(source.url)}»`,
    url: source.url,
    publisher: source.kind === 'prospecto' ? ASFI_PUBLISHER : source.company,
    sha: document.sha256,
    at: document.retrievedAt,
  });
  return { readings, report: { label, rows: table.lines.length, listed: sumOf(table), asOf: source.asOf } };
}
