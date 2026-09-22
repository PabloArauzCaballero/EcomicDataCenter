import { createHash } from 'node:crypto';
import { writeFileSync } from 'node:fs';
import { join } from 'node:path';
import {
  DEPARTMENTS,
  DEPARTMENT_EXPORTS,
  EXPORT_AGGREGATES,
  PUBLISHER,
  REGIONAL_ACCOUNTS,
  accountCode,
  exportCode,
  productSlug,
  type Department,
} from './department-sources';
import { download, firstSheet, normalized, pointsOf, sleep, yearColumns } from './ine-workbook';
import { countPoints, type RegisterSeries } from './annual-register-shape';
import { Workbook, type SheetRow } from './xlsx-cells';

/**
 * Recoge lo que el INE publica de cada departamento, año por año.
 *
 * Dos archivos de una corrida, porque son dos preguntas sobre el mismo mapa:
 * cuánto produce cada departamento —las cuentas regionales, seis cuadros
 * cruzados de 1988 a 2024— y qué vende al exterior —un cuaderno anidado de
 * 2010 en adelante, con los principales productos de cada uno en dólares y en
 * toneladas. `department-sources` explica por qué esos cuadros y no otros.
 *
 * Los cuadros son cuadernos y no una interfaz de consulta, así que aquí no hay
 * cuota que respetar ni paginación que seguir: siete descargas y a leer. Lo que
 * sí hay es una forma que puede cambiar debajo, y contra eso el colector es
 * deliberadamente frágil. Si un cuadro pierde su fila de cabecera, si un
 * departamento deja de aparecer o si una hoja cambia de nombre, la corrida se
 * detiene diciendo cuál: una serie que deja de actualizarse en silencio es el
 * fallo caro, y una corrida rota es el barato.
 *
 * **El año en curso no entra.** El cuadro de exportaciones cierra con una
 * columna «Enero a Julio 2026», que es un acumulado parcial y no un año. Ponerlo
 * en la misma serie que los años cerrados dibujaría una caída del cuarenta por
 * ciento que sólo dice que faltan cinco meses. Es la misma regla que el colector
 * de partidas arancelarias aplica a su registro, escrita aquí otra vez porque
 * aquí el año parcial viene rotulado en castellano y no como un número.
 *
 * Se corre con `yarn departments:collect`.
 */

const ACCOUNTS_SEED = join('src', 'database', 'seeds', 'boot', 'department-accounts.json');
const EXPORTS_SEED = join('src', 'database', 'seeds', 'boot', 'department-exports.json');
/** Las seis medidas del INE cruzadas por departamento. */
async function collectAccounts(retrievedAt: string): Promise<RegisterSeries[]> {
  const series: RegisterSeries[] = [];

  for (const account of REGIONAL_ACCOUNTS) {
    const { bytes, url } = await download(account.share, `cuadro ${account.table}`);
    const sha256 = createHash('sha256').update(bytes).digest('hex');
    const rows = firstSheet(new Workbook(bytes));
    const columns = yearColumns(rows, 'DEPARTAMENTO');

    const byRow = new Map<string, SheetRow>();
    for (const row of rows) {
      const [first] = [...row.values()];
      if (first !== undefined) byRow.set(normalized(first), row);
    }

    let found = 0;
    for (const department of DEPARTMENTS) {
      const row = byRow.get(normalized(department.row));
      if (!row) {
        throw new Error(`cuadro ${account.table}: falta la fila «${department.row}»`);
      }
      const points = pointsOf(
        row,
        columns,
        { cuadro: account.table, fila: department.row },
        {
          url,
          sha256,
          retrievedAt,
        },
      );
      if (!points.length) continue;
      found += 1;
      series.push({
        indicatorCode: accountCode(account, department),
        name: `${account.measure} de ${department.name}`,
        group: department.slug,
        groupLabel: department.name,
        measure: account.measure,
        level: department.level,
        unit: account.unit,
        basis: account.basis,
        publisher: PUBLISHER,
        frequency: 'ANNUAL',
        points,
      });
    }

    console.log(
      `  ${account.table}  ${account.measure.padEnd(30)} ${found} filas, ${columns.size} años`,
    );
    await sleep(1_200);
  }

  return series;
}

/**
 * Qué es una fila del cuadro de exportaciones.
 *
 * El cuadro es una lista plana con la jerarquía puesta a mano: un departamento
 * en mayúsculas, debajo sus productos en versalitas, y al final dos agregados
 * que no pertenecen a ninguno. Nada en el archivo lo declara, así que se lee por
 * el nombre: lo que está en la lista de agregados es un agregado, lo que está
 * en la de departamentos abre un bloque, y cualquier otra fila con cifras es un
 * producto del bloque abierto. Una fila con cifras antes de que ningún bloque
 * esté abierto sería un cuadro que cambió de forma, y detiene la corrida.
 */
type RowKind =
  | { kind: 'aggregate'; slug: string; name: string }
  | { kind: 'department'; department: Department }
  | { kind: 'product'; label: string }
  | { kind: 'ignore' };

function classifyRow(label: string): RowKind {
  const key = normalized(label);
  if (key.startsWith('FUENTE') || key.startsWith('(')) return { kind: 'ignore' };
  const aggregate = EXPORT_AGGREGATES.find((one) => normalized(one.row) === key);
  if (aggregate) return { kind: 'aggregate', slug: aggregate.slug, name: aggregate.name };
  const department = DEPARTMENTS.find(
    (one) => one.level === 'DEPARTMENT' && normalized(one.row) === key,
  );
  if (department) return { kind: 'department', department };
  return { kind: 'product', label };
}

/** Lo que cada departamento vende, en dólares y en toneladas. */
async function collectExports(retrievedAt: string): Promise<RegisterSeries[]> {
  const { bytes, url } = await download(DEPARTMENT_EXPORTS.share, 'exportaciones departamentales');
  const sha256 = createHash('sha256').update(bytes).digest('hex');
  const workbook = new Workbook(bytes);
  const sheetNames = workbook.sheetNames();
  const series: RegisterSeries[] = [];

  for (const [index, sheet] of DEPARTMENT_EXPORTS.sheets.entries()) {
    const sheetName = sheetNames[index];
    if (sheetName === undefined) {
      throw new Error(`el cuaderno de exportaciones no trae la hoja ${index + 1}`);
    }
    const rows = workbook.rows(sheetName);
    const columns = yearColumns(rows, 'DEPARTAMENTO');
    const basis =
      sheet.unit === 'USD_MILLIONS'
        ? 'En millones de dólares estadounidenses, valor declarado en aduana.'
        : 'Peso neto en toneladas, declarado en aduana.';

    let open: Department | null = null;
    let products = 0;

    for (const row of rows) {
      const [label] = [...row.values()];
      if (label === undefined) continue;
      const classified = classifyRow(label);
      if (classified.kind === 'ignore') continue;

      if (classified.kind === 'department') {
        open = classified.department;
      }

      const place =
        classified.kind === 'aggregate'
          ? classified.slug
          : classified.kind === 'department'
            ? classified.department.slug
            : open?.slug;
      if (place === undefined) continue;

      const product = classified.kind === 'product' ? productSlug(label) : undefined;
      const points = pointsOf(
        row,
        columns,
        { hoja: sheetName, fila: label, departamento: open?.row ?? place },
        { url, sha256, retrievedAt },
      );
      if (!points.length) continue;

      if (classified.kind === 'product') {
        if (!open) throw new Error(`«${label}» aparece antes de que ningún departamento se abra`);
        products += 1;
      }

      const owner =
        classified.kind === 'aggregate'
          ? { group: classified.slug, groupLabel: classified.name }
          : { group: open?.slug ?? place, groupLabel: open?.name ?? place };

      series.push({
        indicatorCode: exportCode(sheet.slug, place, product),
        name:
          classified.kind === 'product'
            ? `${label} exportado desde ${owner.groupLabel}`
            : `${sheet.measure} de ${owner.groupLabel}`,
        group: owner.group,
        groupLabel: owner.groupLabel,
        measure: classified.kind === 'product' ? label : sheet.measure,
        level:
          classified.kind === 'product'
            ? 'PRODUCT'
            : classified.kind === 'aggregate'
              ? 'AGGREGATE'
              : 'DEPARTMENT',
        unit: sheet.unit,
        basis,
        publisher: PUBLISHER,
        frequency: 'ANNUAL',
        points,
      });
    }

    console.log(`  ${sheetName.padEnd(32)} ${products} productos, ${columns.size} años cerrados`);
  }

  return series;
}

function write(path: string, series: readonly RegisterSeries[]): void {
  writeFileSync(path, `${JSON.stringify({ series }, null, 2)}\n`, 'utf-8');
  console.log(`  -> ${path}: ${series.length} series, ${countPoints(series)} observaciones`);
}

async function main(): Promise<void> {
  const retrievedAt = `${new Date().toISOString().slice(0, 19)}Z`;

  console.log('\ndepartment-accounts.json  (cuentas regionales del INE)');
  write(ACCOUNTS_SEED, await collectAccounts(retrievedAt));

  console.log('\ndepartment-exports.json  (exportaciones por departamento y producto)');
  write(EXPORTS_SEED, await collectExports(retrievedAt));
}

main().catch((error: unknown) => {
  process.stderr.write(
    `${error instanceof Error ? error.message : 'la recolección departamental falló'}\n`,
  );
  process.exitCode = 1;
});
