import { createHash } from 'node:crypto';
import { writeFileSync } from 'node:fs';
import { join } from 'node:path';

/**
 * Recovers the whole life of the Unidad de Fomento de Vivienda from its issuer.
 *
 * Half the contracts written in this country are denominated in the UFV, and
 * until now the observatory held exactly one reading of it: whatever the front
 * page happened to say the day the quotation collector last ran. A unit whose
 * entire purpose is to carry a value forward through inflation is useless as a
 * single point, because the only question anyone asks of it is what it did
 * between two dates.
 *
 * The bank does publish the archive, just not on the page the front-page
 * collector reads: the chart behind the UFV panel is fed by an endpoint that
 * answers a date range as JSON. It answers from 7 December 2001 — the day the
 * unit was created at exactly 1.000000 — through today, which is the complete
 * series and not a window on it.
 *
 * The range is split into calendar years rather than requested as one span.
 * Each request is its own retrieval and carries its own digest, so a year
 * already held is never re-fetched and never rewritten: closed years are
 * closed, and only the running year changes between runs.
 *
 * Run with `yarn bcb:ufv`.
 */

const SEED = join('src', 'database', 'seeds', 'boot', 'ufv-history.json');
const ENDPOINT = 'https://www.bcb.gob.bo/librerias/charts/ufv.php';
const UA = 'Mozilla/5.0 (compatible; ObservatorioEconomicoBO/1.0)';

/** The day the unit was created, at parity with the boliviano. */
const FIRST_YEAR = 2001;

interface UfvPoint {
  /** Calendar day the value is in force, as the bank dates it. */
  readonly eventDate: string;
  readonly value: string;
  /** The figure exactly as the endpoint writes it. */
  readonly statedValue: string;
  /** The literal record the value was read from. */
  readonly excerpt: string;
}

interface UfvYear {
  readonly period: string;
  readonly sourceUrl: string;
  readonly documentSha256: string;
  readonly retrievedAt: string;
  readonly points: readonly UfvPoint[];
}

/**
 * One record exactly as the endpoint writes it.
 *
 * Its keys are the bank's own Spanish field names, so they are read as data
 * rather than declared as identifiers: the wire format is not ours to rename,
 * and naming a field after it would carry that choice into the codebase.
 */
type EndpointRecord = Record<string, string | undefined>;

const FIELD_DATE = 'fecha';
const FIELD_VALUE = 'val_ufv';

/** `dd/mm/yyyy` as the endpoint writes it, to the calendar order everything else uses. */
function toIsoDate(stated: string): string | null {
  const match = /^(\d{2})\/(\d{2})\/(\d{4})$/u.exec(stated);
  if (!match) return null;
  const [, day, month, year] = match;
  return `${year}-${month}-${day}`;
}

/**
 * The value with the trailing zeros the endpoint pads it with removed.
 *
 * The bank answers eighteen decimal places for a figure it publishes to five.
 * Trimming what is padding keeps the stored reading identical to the printed
 * one; the untrimmed text stays in `statedValue` and in the excerpt, so nothing
 * is lost and the trim itself is checkable.
 */
function trimmedValue(stated: string): string | null {
  if (!/^\d+\.\d+$/u.test(stated)) return null;
  const trimmed = stated.replace(/0+$/u, '').replace(/\.$/u, '.0');
  return trimmed.length ? trimmed : null;
}

async function collectYear(year: number): Promise<UfvYear | null> {
  const sourceUrl = `${ENDPOINT}?cFecIni=${year}-01-01&cFecFin=${year}-12-31`;
  const response = await fetch(sourceUrl, {
    headers: { 'User-Agent': UA },
    signal: AbortSignal.timeout(60_000),
  });
  if (!response.ok) throw new Error(`${year}: el BCB respondio ${response.status}`);
  const bytes = Buffer.from(await response.arrayBuffer());
  const documentSha256 = createHash('sha256').update(bytes).digest('hex');

  const parsed: unknown = JSON.parse(bytes.toString('utf-8'));
  if (!Array.isArray(parsed) || !parsed.length) {
    console.warn(`  ${year}: sin cotizaciones`);
    return null;
  }

  const points: UfvPoint[] = [];
  for (const record of parsed as EndpointRecord[]) {
    const statedDate = record[FIELD_DATE] ?? '';
    const statedValue = record[FIELD_VALUE] ?? '';
    const eventDate = toIsoDate(statedDate);
    const value = trimmedValue(statedValue);
    if (!eventDate || !value) {
      console.warn(`  ${year}: registro ilegible, omitido: ${JSON.stringify(record)}`);
      continue;
    }
    points.push({
      eventDate,
      value,
      statedValue,
      excerpt: JSON.stringify(record),
    });
  }
  if (!points.length) return null;

  points.sort((left, right) => left.eventDate.localeCompare(right.eventDate));
  console.log(
    `  ${year}  ${String(points.length).padStart(3)} dias  ` +
      `${points[0]?.value} -> ${points.at(-1)?.value}`,
  );

  return {
    period: String(year),
    sourceUrl,
    documentSha256,
    retrievedAt: `${new Date().toISOString().slice(0, 19)}Z`,
    points,
  };
}

async function main(): Promise<void> {
  const currentYear = new Date().getUTCFullYear();
  const years: UfvYear[] = [];
  for (let year = FIRST_YEAR; year <= currentYear; year += 1) {
    const collected = await collectYear(year);
    if (collected) years.push(collected);
  }
  if (!years.length) throw new Error('El BCB no devolvio ninguna cotizacion de UFV');

  const total = years.reduce((count, year) => count + year.points.length, 0);
  writeFileSync(SEED, `${JSON.stringify({ years }, null, 2)}\n`, 'utf-8');
  console.log(
    `\n${total} cotizaciones en ${years.length} anios, ` +
      `desde ${years[0]?.points[0]?.eventDate} hasta ${years.at(-1)?.points.at(-1)?.eventDate}`,
  );
}

main().catch((error: unknown) => {
  process.stderr.write(`${error instanceof Error ? error.message : 'UFV collection failed'}\n`);
  process.exitCode = 1;
});
