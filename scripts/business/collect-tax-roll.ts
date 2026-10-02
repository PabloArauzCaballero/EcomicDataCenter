import { SeriesBook, download, writeSeed, type Downloaded } from './business-common';
import { pdfRows, type PdfRow } from './pdf-rows';
import { folded, withinBand } from './tax-geometry';
import { columnText, coverageNote, wealthCollected, wealthPayers } from './tax-notes';
import { readRollTable, type RollRow } from './tax-roll-parse';
import { rollSeries, wealthSeries, type RollRead } from './tax-roll-series';
import { TAX_EDITIONS, type TaxEdition } from './tax-sources';
import { readTopTable } from './tax-top-parse';
import { coverageSeries, topSeries, type TopRead } from './tax-top-series';

/**
 * Recoge de las memorias del SIN el ránking de las cien mayores contribuyentes,
 * el padrón y el Impuesto a las Grandes Fortunas.
 *
 * Una memoria por vez y sólo las páginas que hacen falta: los PDF pesan hasta
 * cincuenta megas y la máquina no tiene memoria para abrir dos. Cada cuadro se
 * lee por posición (`tax-top-parse`, `tax-roll-parse`) y se cuenta: cien filas
 * en el ránking y en cada anexo, y las filas declaradas por bloque en el
 * padrón. Si no cuadra, la corrida se detiene con el año y el cuadro.
 *
 * Se corre con
 * `node --max-old-space-size=700 node_modules/tsx/dist/cli.mjs scripts/business/collect-tax-roll.ts`
 * (agregar `--fresh` para no usar la copia local de los PDF).
 */

const RANKS = Array.from({ length: 100 }, (_, index) => index + 1);

function assertHundred(rows: readonly { rank: number }[], where: string): void {
  const ranks = rows.map((row) => row.rank).sort((a, b) => a - b);
  if (ranks.length !== 100 || ranks.some((rank, index) => rank !== RANKS[index])) {
    const missing = RANKS.filter((rank) => !ranks.includes(rank));
    throw new Error(
      `${where}: ${ranks.length} filas en vez de 100 (faltan ${missing.join(', ') || 'ninguno'})`,
    );
  }
}

const pagesOf = (edition: TaxEdition): number[] =>
  [
    ...edition.top.pages,
    ...(edition.top.annexes ?? []).flatMap((annex) => annex.pages),
    ...(edition.roll?.segments ?? []).map((segment) => segment.page),
    ...(edition.wealth ? [edition.wealth.page] : []),
  ].filter((page, index, all) => all.indexOf(page) === index);

const onPages = (rows: readonly PdfRow[], pages: readonly number[]): PdfRow[] =>
  pages.flatMap((page) => rows.filter((row) => row.page === page));

/** El ránking de una edición, con sus anexos ya convertidos en atributos por puesto. */
function readTop(edition: TaxEdition, doc: Downloaded, rows: readonly PdfRow[]): TopRead {
  const where = `${edition.title}, las cien`;
  const table = readTopTable(onPages(rows, edition.top.pages), 0, where);
  assertHundred(table.rows, where);
  const attributes = new Map<number, Record<string, string>>();
  for (const annex of edition.top.annexes ?? []) {
    const label = `${edition.title}, anexo por ${annex.attribute}`;
    const read = readTopTable(onPages(rows, annex.pages), annex.after, label);
    assertHundred(read.rows, label);
    for (const row of read.rows) {
      const group = read.groups.get(row.rank);
      if (!group) throw new Error(`${label}: el puesto ${row.rank} no cae en ningún subtotal`);
      const own = table.rows.find((main) => main.rank === row.rank);
      if (own && !sameCompany(own.company, row.company)) {
        throw new Error(
          `${label}: el puesto ${row.rank} es «${row.company}» y en el ránking «${own.company}»`,
        );
      }
      const value =
        annex.attribute === 'propiedad'
          ? /^P[uú]blic/iu.test(group)
            ? 'Pública'
            : 'Privada'
          : sentence(group);
      attributes.set(row.rank, { ...(attributes.get(row.rank) ?? {}), [annex.attribute]: value });
    }
  }
  const coverage = coverageNote(table.trailer);
  if (table.stray > 0) console.log(`  ${where}: ${table.stray} líneas con cifras sin fila`);
  return { edition, doc, rows: table.rows, attributes, coverage };
}

/**
 * Si el anexo y el ránking hablan de la misma empresa en ese puesto. El anexo
 * a veces antepone la sigla («IMBA SA INDUSTRIA MOLINERA…»): basta con que el
 * comienzo de una razón social aparezca dentro de la otra.
 */
const letters = (name: string): string => folded(name).replace(/[^A-Z]/gu, '');
const sameCompany = (left: string, right: string): boolean =>
  letters(left).includes(letters(right).slice(0, 8)) ||
  letters(right).includes(letters(left).slice(0, 8));

/** «electricidad y Agua», «CONSTRUCCIÓN» → «Electricidad y agua», «Construcción». */
const sentence = (label: string): string => {
  const lower = label.toLocaleLowerCase('es');
  return lower.charAt(0).toLocaleUpperCase('es') + lower.slice(1);
};

/** El padrón de una edición, contado bloque por bloque. */
function readRoll(
  edition: TaxEdition,
  doc: Downloaded,
  rows: readonly PdfRow[],
): RollRead | undefined {
  const layout = edition.roll;
  if (!layout) return undefined;
  const where = `${edition.title}, padrón`;
  const segments = layout.segments.map((segment) =>
    withinBand(
      rows.filter((row) => row.page === segment.page),
      segment.band ? { [segment.page]: segment.band } : undefined,
    ),
  );
  const read: RollRow[] = readRollTable(segments, layout.columns, where);
  for (const [block, expected] of Object.entries(layout.expected)) {
    const found = read.filter((row) => row.block === block).length;
    if (found !== expected)
      throw new Error(`${where}: el bloque ${block} trae ${found} filas y debía traer ${expected}`);
  }
  const subtitle = edition.partial
    ? segments
        .flat()
        .map((row) => /Enero\s+a\s+\p{L}+\s+\d{4}(?:\s*-\s*\d{4})?/iu.exec(row.text)?.[0])
        .find(Boolean)
    : undefined;
  return {
    edition,
    doc,
    rows: read,
    coverage: subtitle ?? edition.partial ?? `gestión ${edition.year}`,
  };
}

async function main(): Promise<void> {
  const book = new SeriesBook();
  const rollBook = new SeriesBook();
  const tops: TopRead[] = [];
  const report: string[] = [];
  for (const edition of TAX_EDITIONS) {
    const doc = await download(edition.url);
    const rows = await pdfRows(doc.bytes, pagesOf(edition));
    const top = readTop(edition, doc, rows);
    tops.push(top);
    const roll = readRoll(edition, doc, rows);
    if (roll) rollSeries(roll, rollBook);
    let wealth = '';
    if (edition.wealth) {
      const text = columnText(rows, edition.wealth);
      const payers = wealthPayers(text);
      const collected = wealthCollected(text);
      wealthSeries(edition, doc, payers, collected?.malformed ? undefined : collected, rollBook);
      wealth = ` · IGF ${payers?.figure ?? 'sin inscritos'} / ${collected?.malformed ? `monto ilegible «${collected.malformed}»` : (collected?.figure ?? 'sin monto')}`;
    }
    report.push(
      `${edition.year}: 100 filas, ${top.attributes.size} con anexo, cobertura ${top.coverage?.figure ?? '—'}%` +
        `${roll ? ` · padrón ${roll.rows.length} filas (${roll.coverage})` : ' · sin padrón'}${wealth}`,
    );
  }
  const { filled, anomalies } = topSeries(tops, book);
  const missing = coverageSeries(tops, book);
  console.log(report.join('\n'));
  console.log(
    `  2011 desde la columna de comparación de 2012: ${filled} empresas (pagado y participación, sin puesto)`,
  );
  if (anomalies.length > 0)
    console.log(
      `  el ránking impreso no baja siempre (errata de la fuente): ${anomalies.join(' · ')}`,
    );
  if (missing.length > 0) console.log(`  sin nota de cobertura: ${missing.join(', ')}`);
  writeSeed('tax-top-payers.json', book.all());
  writeSeed('tax-roll.json', rollBook.all());
}

main().catch((error: unknown) => {
  console.error(error instanceof Error ? error.message : error);
  process.exit(1);
});
