import { DAMODARAN, WEALTH_PREFIX, type MultiplesFile } from './wealth-sources';
import { codeOf, download, type SeriesBook } from './business-common';
import { biffSheets, type BiffValue } from './biff-cells';

/**
 * El precio sobre valor en libros por industria, mercados emergentes.
 *
 * Damodaran cambió tres veces la forma de la hoja en quince años: sin cabecera
 * de metadatos en 2011, con siete filas de metadatos desde 2013, con una
 * segunda pestaña de definiciones desde 2020 —que en 2024 pasó a ser la
 * primera—. Por eso no se busca la hoja por nombre ni la tabla por fila: se
 * busca la fila cuya cabecera dice «PBV» y se lee hacia abajo. Los nombres de
 * columna se citan como la hoja los escribe, erratas incluidas.
 */

const EXCEL_EPOCH = Date.UTC(1899, 11, 30);

/** El año en que el archivo dice haberse actualizado, si lo dice. */
function updatedYear(rows: readonly (readonly (BiffValue | undefined)[])[]): number | null {
  for (const row of rows.slice(0, 8)) {
    if (row?.[0] === 'Date updated:' && typeof row[1] === 'number') {
      return new Date(EXCEL_EPOCH + row[1] * 86_400_000).getUTCFullYear();
    }
  }
  return null;
}

/**
 * La cabecera de la tabla: la fila que nombra a la vez «PBV» y «ROE». Sólo
 * «PBV» no alcanza, porque la pestaña de definiciones también la nombra, en
 * una fila suya, como término que explica.
 */
const isHead = (row: readonly (BiffValue | undefined)[] | undefined): boolean =>
  Boolean(row?.includes('PBV') && row.includes('ROE'));

async function readFile(source: MultiplesFile, book: SeriesBook): Promise<number> {
  const file = await download(source.url);
  const sheets = biffSheets(file.bytes);
  const sheet = sheets.find((candidate) => candidate.rows.some(isHead));
  if (!sheet) throw new Error(`Damodaran ${source.period}: ninguna hoja trae la columna PBV`);
  const stamp = updatedYear(sheet.rows);
  if (stamp !== null && stamp - 1 !== Number(source.period)) {
    throw new Error(`Damodaran ${source.period}: el archivo dice actualizado en ${stamp}`);
  }
  const headAt = sheet.rows.findIndex(isHead);
  const head = (sheet.rows[headAt] ?? []).map((cell) => String(cell ?? '').trim());
  const ratioAt = head.indexOf('PBV');

  let count = 0;
  for (const row of sheet.rows.slice(headAt + 1)) {
    const industry = typeof row?.[0] === 'string' ? row[0].trim() : '';
    const ratio = row?.[ratioAt];
    if (!industry || typeof ratio !== 'number') continue;
    if (/e/iu.test(String(ratio)))
      throw new Error(`Damodaran ${source.period}: ${industry} con exponente`);
    const quoted: Record<string, BiffValue> = {};
    head.forEach((label, index) => {
      const cell = row?.[index];
      if (label && cell !== undefined)
        quoted[label] = typeof cell === 'string' ? cell.trim() : cell;
    });
    const code = codeOf(industry, 60);
    book.add(
      {
        indicatorCode: `${WEALTH_PREFIX}PBV_EM_${code}`,
        name: `${industry}: precio sobre valor en libros, mercados emergentes`,
        group: code,
        groupLabel: industry,
        measure: 'Precio sobre valor en libros (PBV), mercados emergentes',
        level: 'AGGREGATE',
        unit: 'RATIO',
        basis:
          'Capitalización bursátil agregada sobre patrimonio contable agregado de las cotizadas de la industria en mercados emergentes, al cierre del año. Es un múltiplo de mercado de referencia, no una valoración de empresas bolivianas.',
        publisher: DAMODARAN.publisher,
      },
      {
        period: source.period,
        value: String(ratio),
        excerpt: JSON.stringify(quoted),
        sourceUrl: source.url,
        upstreamSha256: file.sha256,
        retrievedAt: file.retrievedAt,
      },
    );
    count += 1;
  }
  if (count !== source.rows) {
    throw new Error(
      `Damodaran ${source.period}: ${count} industrias leídas, se esperaban ${source.rows}`,
    );
  }
  return count;
}

export async function collectDamodaran(book: SeriesBook): Promise<void> {
  for (const source of DAMODARAN.files) {
    const count = await readFile(source, book);
    console.log(`  Damodaran ${source.period}: ${count} industrias`);
  }
}
