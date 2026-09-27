import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { Workbook } from '../macro/xlsx-cells';
import { downloadYear, listYears, type YearLink } from './ine-trade-pages';
import { TradeCatalogue, type CatalogueOutput, type Flow } from './trade-catalogue';
import { YearReader, type YearCubes } from './trade-cube';

/**
 * Trae la base de comercio exterior del INE, registro por registro, y la deja
 * como semilla del núcleo.
 *
 * Es la fuente más fina que existe para Bolivia: la misma declaración aduanera
 * (DUE/DEX de exportación, DUI de importación) que la Aduana Nacional entrega al
 * INE cada mes, con partida NANDINA de diez dígitos, país, departamento, mes,
 * peso y valor. Trade Map (ITC), el IBCE y Comtrade publican esta misma
 * declaración, agregada: Comtrade a seis dígitos y sin departamento ni mes en
 * su nivel gratuito, Trade Map detrás de una cuenta, el IBCE en boletines. Leer
 * al INE directo es tener el detalle sin intermediario.
 *
 * Exportaciones desde 1992 y la importación desde 2010, por tamaño: cada año
 * de importaciones son cincuenta megabytes de cuaderno y cuarenta y siete mil
 * filas ya agregadas; 2010 en adelante cubre el periodo que el INE también
 * publica en sus cuadros por departamento y producto.
 *
 * `yarn trade-records:collect [--flow=X|M] [--from=AAAA] [--to=AAAA] [--cache=dir] [--force]`.
 * Sin `--flow` corre los dos. El catálogo se fusiona con el que ya existe, así
 * que refrescar sólo el año en curso no borra los nombres de los demás.
 */

const OUT = join('src', 'database', 'seeds', 'boot', 'ine-trade');
const PUBLISHER = 'INSTITUTO NACIONAL DE ESTADISTICA';
const FIRST_YEAR: Readonly<Record<Flow, number>> = { X: 1992, M: 2010 };
const COLUMNS: Readonly<Record<Flow, { detail: string[]; monthly: string[] }>> = {
  X: {
    detail: ['month', 'nandina', 'country', 'department', 'kind', 'usd', 'kg', 'fineKg'],
    monthly: [],
  },
  M: {
    detail: ['nandina', 'country', 'usd', 'fobUsd', 'kg'],
    monthly: ['month', 'use', 'chapter', 'department', 'usd', 'fobUsd', 'kg'],
  },
};
const FILE_PREFIX: Readonly<Record<Flow, string>> = { X: 'exports', M: 'imports' };

function argument(name: string): string | undefined {
  return process.argv.find((value) => value.startsWith(`--${name}=`))?.split('=')[1];
}

/** La hoja que trae la cabecera NANDINA; algunos años llevan una hoja de notas delante. */
async function registerSheet(workbook: Workbook, what: string): Promise<string> {
  for (const name of workbook.sheetNames()) {
    let found = false;
    let seen = 0;
    await workbook.eachRow(name, (row) => {
      seen += 1;
      found = [...row.values()].some((cell) => cell.trim().toUpperCase() === 'NANDINA');
      return !found && seen < 10;
    });
    if (found) return name;
  }
  throw new Error(`${what}: ninguna hoja trae la cabecera NANDINA`);
}

/** JSON con una fila del cubo por línea: legible en un diff y sin sangrías que pesen. */
function writeYear(link: YearLink, cubes: YearCubes, provenance: Record<string, string>): string {
  const head = {
    flow: link.flow,
    year: link.year,
    label: link.label,
    provisional: link.provisional,
    months: cubes.months,
    records: cubes.records,
    totals: cubes.totals,
    provenance,
    columns: COLUMNS[link.flow],
  };
  const rows = (list: YearCubes['detail']): string =>
    list.length ? `[\n${list.map((row) => `    ${JSON.stringify(row)}`).join(',\n')}\n  ]` : '[]';
  const text = `${JSON.stringify(head, null, 2).slice(0, -2)},\n  "detail": ${rows(cubes.detail)},\n  "monthly": ${rows(cubes.monthly)}\n}\n`;
  const file = yearFile(link);
  writeFileSync(file, text);
  return file;
}

const yearFile = (link: YearLink): string =>
  join(OUT, `${FILE_PREFIX[link.flow]}-${link.year}.json`);

/** Lo que la semilla de ese año ya cita, para no rehacerla si el INE no la cambió. */
function heldSource(
  link: YearLink,
): { label: string | undefined; url: string | undefined; sha256: string | undefined } | null {
  const file = yearFile(link);
  if (!existsSync(file)) return null;
  const head = JSON.parse(readFileSync(file, 'utf-8')) as {
    label?: string;
    provenance?: { sourceUrl?: string; upstreamSha256?: string };
  };
  return {
    label: head.label,
    url: head.provenance?.sourceUrl,
    sha256: head.provenance?.upstreamSha256,
  };
}

/**
 * Un año, sólo si el INE lo cambió. El enlace compartido cambia cuando el INE
 * republica; si es el mismo, la semilla ya dice lo que hay. Si cambió pero el
 * cuaderno es idéntico byte a byte, tampoco se toca: una semilla reescrita con
 * otra hora de descarga es un commit y un despliegue que no traen nada.
 */
async function collectYear(
  link: YearLink,
  catalogue: TradeCatalogue,
  cache: string | null,
  force: boolean,
): Promise<boolean> {
  const held = force ? null : heldSource(link);
  if (held?.url === link.url && held.label === link.label) return false;
  const download = await downloadYear(link, cache);
  if (held?.sha256 === download.sha256 && held.label === link.label) {
    console.log(`${link.label.padEnd(32)} republicado sin cambios (misma huella)`);
    return false;
  }
  const workbook = new Workbook(download.bytes);
  const sheet = await registerSheet(workbook, link.label);
  const reader = new YearReader(link.flow, link.label, catalogue);
  await workbook.eachRow(sheet, (row) => reader.visit(row));
  const cubes = reader.finish();
  const file = writeYear(link, cubes, {
    publisher: PUBLISHER,
    title: link.label,
    sourceUrl: link.url,
    upstreamSha256: download.sha256,
    retrievedAt: download.retrievedAt,
  });
  const millions = (cubes.totals.usd / 1e6).toFixed(1);
  console.log(
    `${link.label.padEnd(32)} ${String(cubes.records).padStart(7)} registros → ` +
      `${String(cubes.detail.length).padStart(6)} filas, ${cubes.monthly.length} mensuales, ` +
      `${millions} M US$, meses ${cubes.months[0]}-${cubes.months.at(-1)}  ${file}`,
  );
  return true;
}

async function main(): Promise<void> {
  const flows: Flow[] = argument('flow') ? [argument('flow') as Flow] : ['X', 'M'];
  const cache = argument('cache') ?? null;
  const force = process.argv.includes('--force');
  let changed = 0;
  mkdirSync(OUT, { recursive: true });
  const catalogueFile = join(OUT, 'catalogue.json');
  const catalogue = new TradeCatalogue();
  if (existsSync(catalogueFile)) {
    catalogue.absorb(JSON.parse(readFileSync(catalogueFile, 'utf-8')) as CatalogueOutput);
  }

  for (const flow of flows) {
    if (flow !== 'X' && flow !== 'M') throw new Error(`--flow=${String(flow)}: usa X o M`);
    const from = Number(argument('from') ?? FIRST_YEAR[flow]);
    const to = Number(argument('to') ?? 9999);
    const links = (await listYears(flow))
      .filter((link) => link.year >= from && link.year <= to)
      .sort((left, right) => left.year - right.year);
    const missing: number[] = [];
    const last = Math.min(to, Math.max(...links.map((link) => link.year)));
    for (let year = Math.max(from, FIRST_YEAR[flow]); year <= last; year += 1) {
      if (!links.some((link) => link.year === year)) missing.push(year);
    }
    if (missing.length) throw new Error(`${flow}: la página no lista ${missing.join(', ')}`);
    for (const link of links) {
      if (!(await collectYear(link, catalogue, cache, force))) continue;
      changed += 1;
      writeFileSync(catalogueFile, `${JSON.stringify(catalogue.output(), null, 1)}\n`);
    }
  }
  console.log(changed ? `${changed} años actualizados` : 'el INE no publicó nada nuevo');
}

main().catch((error: unknown) => {
  console.error(error instanceof Error ? error.message : error);
  process.exitCode = 1;
});
