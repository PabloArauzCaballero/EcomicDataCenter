import { Workbook, type SheetRow } from '../macro/xlsx-cells';
import {
  describe,
  download,
  fail,
  monthDate,
  plainValue,
  writeFamily,
  type AccountSeries,
  type Unit,
} from './public-accounts-seed';

/**
 * Cuánto debe el Tesoro y a quién.
 *
 * El Viceministerio de Tesoro y Crédito Público publica cada mes dos cuadernos: la deuda
 * **externa** del Tesoro General de la Nación por acreedor (BID, CAF, Banco Mundial,
 * China, bonos soberanos…, en millones de dólares) y la **interna** por quién la tiene
 * (el Banco Central, el sector privado, en millones de bolivianos). Cada cuaderno trae en
 * su hoja «Saldo» el saldo de fin de mes desde diciembre del año anterior.
 *
 * Se leen todos los cuadernos de las dos páginas y se juntan: cada uno repite los meses
 * anteriores, y donde dos dicen distinto gana el más reciente, que es el que revisó la
 * cifra. Los cuadernos de diciembre de 2024 y anteriores tienen otra forma (una columna,
 * sin meses) y no se leen: el aviso de cuántos se saltaron sale al final.
 *
 * La deuda interna del TGN **no incluye** la de los gobiernos subnacionales ni la de las
 * empresas públicas: el sector público no financiero debe más, y el tablero lo dice.
 *
 * Se ejecuta con `yarn fiscal:debt`.
 */

const FAMILY = 'deuda-tgn';
const PAGES = [
  { kind: 'EXT', url: 'https://www.economiayfinanzas.gob.bo/viceministerios/vtcp/deuda-externa-tgn', unit: 'MM_USD' as Unit, label: 'Deuda externa del TGN', measure: 'millones de US$' },
  { kind: 'INT', url: 'https://www.economiayfinanzas.gob.bo/viceministerios/vtcp/deuda-interna-tgn', unit: 'MM_BOB' as Unit, label: 'Deuda interna del TGN', measure: 'millones de Bs' },
] as const;

const MONTHS = ['ENE', 'FEB', 'MAR', 'ABR', 'MAY', 'JUN', 'JUL', 'AGO', 'SEP', 'OCT', 'NOV', 'DIC'];

/** Etiquetas de la hoja de la deuda interna que se guardan, por la forma en que cuentan. */
const INTERNAL_KEEP = new Map<string, string>([
  ['DEUDA PUBLICA INTERNA TOTAL DEL TGN', 'TOTAL'],
  ['SECTOR PUBLICO FINANCIERO', 'SECTOR_PUBLICO_FINANCIERO'],
  ['BCB', 'BANCO_CENTRAL'],
  ['SECTOR PRIVADO', 'SECTOR_PRIVADO'],
  ['MERCADO FINANCIERO (SUBASTA)', 'MERCADO_FINANCIERO'],
]);

const plain = (text: string): string =>
  text
    .normalize('NFD')
    .replace(/[̀-ͯ]/gu, '')
    .replace(/\s+/gu, ' ')
    .trim();

const slug = (text: string): string =>
  plain(text)
    .toUpperCase()
    .replace(/\([^)]*\)/gu, ' ')
    .replace(/[^A-Z0-9]+/gu, '_')
    .replace(/^_+|_+$/gu, '')
    .slice(0, 44);

/** Los acreedores externos llevan el nombre largo: se acorta a lo que un lector reconoce. */
function creditorName(label: string): string {
  const text = plain(label);
  const short = /\(([A-Z]{2,6})\)\s*$/u.exec(text);
  if (short) return `${short[1]} (${text.replace(/\s*\([A-Z]{2,6}\)\s*$/u, '')})`;
  return text;
}

interface Sheet {
  readonly name: string;
  readonly year: number;
  readonly rows: readonly SheetRow[];
  readonly header: number;
  readonly months: Map<string, string>;
}

function stockSheet(book: Workbook): Sheet | null {
  for (const name of book.sheetNames()) {
    if (!/^saldo$/iu.test(name.trim())) continue;
    const rows = book.rows(name);
    const header = rows.findIndex((row) => /^detalle$/iu.test(plain(row.get('A') ?? '')));
    if (header < 0) continue;
    const titled = rows
      .slice(0, header)
      .map((row) => /(20\d{2})\s*\(p\)/iu.exec(row.get('A') ?? ''))
      .find((match) => match !== null && match !== undefined);
    if (!titled?.[1]) continue;
    const year = Number(titled[1]);
    const months = new Map<string, string>();
    for (const [column, text] of rows[header]?.entries() ?? []) {
      const cell = plain(text).toUpperCase();
      const dated = /^([A-Z]{3})(?:-(\d{2}))?$/u.exec(cell);
      if (!dated?.[1] || MONTHS.indexOf(dated[1]) < 0) continue;
      const month = MONTHS.indexOf(dated[1]) + 1;
      // «Dic-25» es el cierre del año anterior; «Ene»…«Dic» son del año del título.
      const date = dated[2] ? monthDate(2000 + Number(dated[2]), month) : monthDate(year, month);
      months.set(column, date);
    }
    // Los meses que todavia no ocurrieron traen un 0 en la hoja, no un hueco: un saldo de
    // deuda en 0 no es una lectura. Cuenta como informado el mes en que el total no es 0.
    const total = rows.slice(header + 1).find((row) => /total/iu.test(plain(row.get('A') ?? '')));
    for (const column of [...months.keys()]) {
      const figure = Number(plainValue(total?.get(column)) ?? 0);
      if (figure === 0) months.delete(column);
    }
    if (months.size > 0) return { name, year, rows, header, months };
  }
  return null;
}

interface Collected {
  readonly code: string;
  readonly name: string;
  readonly concept: string;
  readonly kind: (typeof PAGES)[number];
  points: Map<string, string>;
  sourceUrl: string;
  sha256: string;
  retrievedAt: string;
  row: number;
  sheet: string;
}

async function main(): Promise<void> {
  const collected = new Map<string, Collected>();
  let skipped = 0;
  let read = 0;

  for (const page of PAGES) {
    const html = (await download(page.url)).bytes.toString('utf-8');
    const links = [
      ...new Set(
        [...html.matchAll(/href="([^"]+\.xlsx?)"/giu)].map((match) =>
          new URL(match[1] as string, page.url).toString(),
        ),
      ),
    ];
    // Los más viejos primero: el que revisó la cifra más tarde, la deja.
    const files: Array<{ url: string; sheet: Sheet; sha256: string; retrievedAt: string; at: number }> = [];
    for (const url of links) {
      const file = await download(url);
      const sheet = stockSheet(new Workbook(file.bytes));
      if (!sheet) {
        skipped += 1;
        continue;
      }
      files.push({ url, sheet, sha256: file.sha256, retrievedAt: file.retrievedAt, at: Math.max(...[...sheet.months.values()].map((date) => Number(date.slice(0, 7).replace('-', '')))) });
    }
    files.sort((left, right) => left.at - right.at);

    for (const { url, sheet, sha256, retrievedAt } of files) {
      read += 1;
      const seen = new Set<string>();
      sheet.rows.forEach((row, index) => {
        if (index <= sheet.header) return;
        const label = plain(row.get('A') ?? '');
        if (!label || /^(fuente|elaboracion|\(p\)|fecha de reporte|nota)/iu.test(label)) return;
        const upper = label.toUpperCase();
        let concept: string;
        let name: string;
        if (page.kind === 'INT') {
          const kept = INTERNAL_KEEP.get(upper);
          if (!kept || seen.has(kept)) return;
          concept = kept;
          name = label === 'BCB' ? 'Banco Central de Bolivia' : label;
        } else {
          if (/^deuda publica externa total/iu.test(label)) {
            concept = 'TOTAL';
            name = 'Total';
          } else {
            concept = slug(label);
            name = creditorName(label);
          }
          if (!concept || seen.has(concept)) return;
        }
        seen.add(concept);
        const code = `FISC_DEBT_${page.kind}_${concept}_${page.unit}`;
        const held = collected.get(code) ?? {
          code,
          name: `${page.label} · ${name} (${page.measure}, saldo a fin de mes)`,
          concept,
          kind: page,
          points: new Map<string, string>(),
          sourceUrl: url,
          sha256,
          retrievedAt,
          row: index + 1,
          sheet: sheet.name,
        };
        let any = false;
        for (const [column, date] of sheet.months) {
          const value = plainValue(row.get(column));
          if (value === null) continue;
          held.points.set(date, value);
          any = true;
        }
        if (!any) return;
        held.sourceUrl = url;
        held.sha256 = sha256;
        held.retrievedAt = retrievedAt;
        held.row = index + 1;
        held.sheet = sheet.name;
        collected.set(code, held);
      });
    }
  }

  const series: AccountSeries[] = [...collected.values()]
    .map((one) => ({
      indicatorCode: one.code,
      name: one.name,
      family: FAMILY,
      topic: 'deuda',
      place: 'BOL',
      concept: `${one.kind.kind}_${one.concept}`,
      perimeter: 'TGN',
      unit: one.kind.unit,
      frequency: 'MONTHLY' as const,
      publisher: 'Ministerio de Economía y Finanzas Públicas',
      locator: { orientation: 'rows', sheet: one.sheet, row: one.row },
      sourceUrl: one.sourceUrl,
      upstreamSha256: one.sha256,
      retrievedAt: one.retrievedAt,
      points: [...one.points.entries()].sort(([a], [b]) => a.localeCompare(b)),
    }))
    // Un acreedor que ya no tiene saldo (Venezuela, Banco de la Nación Argentina) es un cero
    // en todos los meses: no cuenta nada que un gráfico deba dibujar.
    .filter((one) => one.points.length >= 2 && one.points.some(([, value]) => Number(value) !== 0))
    .sort((left, right) => left.indicatorCode.localeCompare(right.indicatorCode));

  const path = writeFamily(FAMILY, series);
  for (const one of series) console.log(describe(one));
  console.log(`  ${read} cuadernos leidos, ${skipped} con otra forma saltados`);
  console.log(`  -> ${series.length} series en ${path}`);
}

main().catch(fail);
