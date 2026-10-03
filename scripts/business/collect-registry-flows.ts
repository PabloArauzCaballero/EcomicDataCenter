import { download, writeSeed, type Downloaded } from './business-common';
import { pdfRows } from './pdf-rows';
import { municipalFigures } from './registry-flow-municipal';
import { seprecCancelled, seprecMemoryNew, seprecNew, seprecRenewalGroups, seprecRenewed, type SeprecFigure } from './registry-flow-seprec';
import { buildSeries, resolve, type Candidate, type FlowDimension } from './registry-flow-series';
import { FUNDEMPRESA, FUNDEMPRESA_REPORTS, SEPREC, SEPREC_CANCELLATION_MEMORIES, SEPREC_MEMORY, SEPREC_MONTHLY, type FundempresaReport, type Measure } from './registry-flow-sources';
import { readTable } from './registry-flow-tables';

/**
 * Recoge los flujos del registro de comercio: inscripciones, actualizaciones y
 * cancelaciones de matrícula por año, departamento, forma societaria y
 * actividad, de 2005 a 2025.
 *
 * `registry-flow-sources` dice qué documentos y por qué; aquí está el cómo. Los
 * cuadros se leen por coordenadas y cada uno se comprueba contra su propio
 * TOTAL; lo que el SEPREC publica sólo en frases se lee de las frases. La
 * corrida termina diciendo, además de cuánto escribió, en qué años dos
 * documentos daban cifras distintas para lo mismo: es la huella de las
 * revisiones de FUNDEMPRESA y conviene verla antes de publicar.
 *
 * Se corre con
 * `node --max-old-space-size=700 node_modules/tsx/dist/cli.mjs scripts/business/collect-registry-flows.ts`
 * (`--fresh` para no usar las copias locales).
 */

const SEED = 'business-registry-flows.json';

interface Source {
  readonly url: string;
  readonly file: Downloaded;
  readonly publisher: string;
}

const stamp = (source: Source) => ({
  sourceUrl: source.url,
  sha256: source.file.sha256,
  retrievedAt: source.file.retrievedAt,
  publisher: source.publisher,
});

/** Las celdas de un reporte de FUNDEMPRESA convertidas en candidatas. */
async function fromReport(report: FundempresaReport): Promise<Candidate[]> {
  const file = await download(report.url);
  const source = { url: report.url, file, publisher: FUNDEMPRESA };
  const rows = await pdfRows(file.bytes);
  const where = report.edition;
  const found: Candidate[] = [];
  const own = Number(report.year);
  for (const table of report.tables) {
    for (const cell of readTable(rows, table, where)) {
      const cross = table.columns === 'departments';
      // En el cruzado, la columna TOTAL y la fila TOTAL repiten los cuadros simples.
      if (cross && (cell.columnKey === 'TOTAL' || cell.rowKey === 'BOLIVIA')) continue;
      const year = cross || table.columns === 'single' ? report.year : cell.columnKey;
      const crossed: FlowDimension = table.dimension === 'CIIU3' ? 'DEPTCIIU3' : 'DEPTCIIU';
      const dimension: FlowDimension = cross ? crossed : cell.rowKey === 'BOLIVIA' ? 'TOTAL' : table.dimension;
      const key = cross ? `${cell.columnKey}__${cell.rowKey}` : cell.rowKey;
      const rank = Number(year) === own ? 0 : 10_000 - own;
      found.push({
        measure: table.measure,
        dimension,
        key,
        year,
        value: cell.value,
        excerpt: cell.excerpt,
        rank,
        ...stamp(source),
      });
    }
  }
  if (report.municipalities) {
    for (const figure of municipalFigures(rows, where)) {
      found.push({
        measure: figure.measure,
        dimension: 'MUNI',
        key: figure.key,
        label: figure.name,
        year: report.year,
        value: figure.value,
        excerpt: figure.excerpt,
        rank: 0,
        ...stamp(source),
      });
    }
  }
  console.log(`  ${where}: ${found.length} lecturas`);
  return found;
}

function fromSeprec(figures: readonly SeprecFigure[], measure: Measure, dimension: FlowDimension, source: Source): Candidate[] {
  return figures.map((figure) => ({
    measure,
    dimension,
    key: figure.key,
    label: figure.key.charAt(0) + figure.key.slice(1).toLowerCase(),
    year: figure.year,
    value: figure.value,
    excerpt: figure.excerpt,
    // Una gestión entera gana a una parcial del mismo año.
    rank: figure.months ? 1 : 0,
    ...(figure.months ? { months: figure.months } : {}),
    ...(figure.note ? { note: figure.note } : {}),
    ...stamp(source),
  }));
}

/** Lo del SEPREC: inscripciones, renovaciones y cancelaciones con sus desgloses verificables. */
async function seprecCandidates(): Promise<Candidate[]> {
  const fresh = async (url: string): Promise<Source> => ({
    url,
    file: await download(url),
    publisher: SEPREC,
  });
  const news = await fresh(SEPREC_MONTHLY.newUrl);
  const renewals = await fresh(SEPREC_MONTHLY.renewedUrl);
  const memory = await fresh(SEPREC_MEMORY.url);
  const newRows = await pdfRows(news.file.bytes, [2]);
  const renewedRows = await pdfRows(renewals.file.bytes, [2]);
  const memoryRows = await pdfRows(memory.file.bytes, SEPREC_MEMORY.pages);
  const totalsNew = seprecNew(newRows);
  const totalsRenewed = seprecRenewed(renewedRows);
  const memoryNew = seprecMemoryNew(memoryRows);
  for (const [name, list] of [
    ['inscripciones', totalsNew],
    ['renovaciones', totalsRenewed],
  ] as const) {
    if (list.length !== SEPREC_MONTHLY.years) {
      throw new Error(`${SEPREC_MONTHLY.edition}, ${name}: ${list.length} gestiones y debían ser ${SEPREC_MONTHLY.years}`);
    }
  }
  if (memoryNew.length !== 1) throw new Error(`${SEPREC_MEMORY.edition}: ${memoryNew.length} cifras de inscripción de 2022`);
  const groups = seprecRenewalGroups(renewedRows, totalsRenewed, SEPREC_MONTHLY.edition);
  const cancelled: Candidate[] = [];
  for (const cancellationMemory of SEPREC_CANCELLATION_MEMORIES) {
    const source = await fresh(cancellationMemory.url);
    const rows = await pdfRows(source.file.bytes, cancellationMemory.pages);
    const figures = seprecCancelled(rows, cancellationMemory.year);
    if (figures.length !== 10) {
      throw new Error(`${cancellationMemory.edition}: ${figures.length} cifras de cancelación y debían ser 10`);
    }
    cancelled.push(
      ...fromSeprec(
        figures.filter((figure) => figure.key === 'BOLIVIA'),
        'CANCELLED',
        'TOTAL',
        source,
      ),
      ...fromSeprec(
        figures.filter((figure) => figure.key !== 'BOLIVIA'),
        'CANCELLED',
        'DEPT',
        source,
      ),
    );
  }
  return [
    ...fromSeprec(totalsNew, 'NEW', 'TOTAL', news),
    ...fromSeprec(memoryNew, 'NEW', 'TOTAL', memory).map((one) => ({
      ...one,
      note: '2022 es la gestión entera según la Memoria del SEPREC; incluye enero a marzo, aún en FUNDEMPRESA',
    })),
    ...fromSeprec(totalsRenewed, 'RENEWED', 'TOTAL', renewals),
    ...fromSeprec(groups, 'RENEWED', 'GROUP', renewals),
    ...cancelled,
  ];
}

async function main(): Promise<void> {
  // El SEPREC primero, con la memoria del proceso limpia: su memoria institucional
  // pesa quince megas. Después los reportes de a uno por vez.
  const candidates: Candidate[] = await seprecCandidates();
  for (const report of FUNDEMPRESA_REPORTS) candidates.push(...(await fromReport(report)));
  const { chosen, disagreements } = resolve(candidates);
  const series = buildSeries(chosen);
  writeSeed(SEED, series);
  console.log(`  ${disagreements.length} años con lecturas distintas entre documentos (gana el reporte del propio año):`);
  for (const line of disagreements) console.log(`    ${line}`);
}

main().catch((error: unknown) => {
  console.error(error instanceof Error ? error.message : error);
  process.exitCode = 1;
});
