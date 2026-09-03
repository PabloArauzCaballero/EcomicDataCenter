import { createHash } from 'node:crypto';
import { mkdirSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import {
  INDICATORS_PER_FILE,
  PANEL_COUNTRIES,
  PUBLISHER,
  PUBLISHER_DOMAIN,
  USER_AGENT,
  WDI_SOURCE,
  WORLD_BANK_API,
} from './worldbank-panel-sources';

/**
 * Captures the whole World Development Indicators collection for Bolivia and
 * the economies it is read against.
 *
 * The observatory carried a hundred and seventeen hand-picked series for one
 * country. That is a reading list, not a corpus: the choice of which hundred
 * were worth carrying was made once, by one person, and every question outside
 * it had no data behind it. The collection itself holds fifteen hundred series
 * on the same definitions, and the publisher serves all of them.
 *
 * One request per indicator, thirty countries at a time, every year the series
 * has. Each request carries its own address and its own digest, because that is
 * what makes a figure checkable: a reader can fetch the same URL and hash the
 * same bytes. A digest over the whole corpus would prove nothing about any
 * single series in it.
 *
 * Written as compact triples — country, year, value — rather than as one object
 * per observation. The shape a loader wants and the shape a file should hold
 * are not the same thing at a million rows: expanded, this corpus is a hundred
 * megabytes of repeated keys.
 *
 * Run with `yarn macro:panel`. It is resumable in the sense that matters: each
 * slice is written as soon as it is complete, so an interrupted run leaves the
 * slices it finished and re-running rewrites them identically.
 */

const SEEDS = join('src', 'database', 'seeds', 'boot', 'worldbank-panel');
/** The register answers in one page at this size for thirty countries. */
const PAGE_SIZE = 20_000;
const PAUSE_MS = 120;
const ATTEMPTS = 4;

/** The catalogue as the register serves it, before the fields are trusted. */
interface CataloguePayload {
  readonly id?: string;
  readonly name?: string;
  readonly unit?: string;
  readonly sourceNote?: string;
}

interface CatalogueEntry {
  readonly id: string;
  readonly name: string;
  readonly unit: string;
  readonly sourceNote: string;
}

interface Observation {
  readonly countryiso3code: string;
  readonly date: string;
  readonly value: number | null;
}

interface Series {
  readonly indicatorCode: string;
  readonly indicatorName: string;
  readonly sourceUrl: string;
  readonly sha256: string;
  /** [ISO3, year, value] — the shape that keeps a million rows readable. */
  readonly points: ReadonlyArray<readonly [string, number, number]>;
}

const sleep = (ms: number): Promise<void> => new Promise((resolve) => setTimeout(resolve, ms));

async function fetchJson(url: string): Promise<{ bytes: Buffer; parsed: unknown }> {
  let lastError = 'sin respuesta';
  for (let attempt = 1; attempt <= ATTEMPTS; attempt += 1) {
    try {
      const response = await fetch(url, { headers: { 'user-agent': USER_AGENT } });
      if (response.ok) {
        const bytes = Buffer.from(await response.arrayBuffer());
        return { bytes, parsed: JSON.parse(bytes.toString('utf8')) };
      }
      lastError = `HTTP ${response.status}`;
    } catch (error) {
      lastError = error instanceof Error ? error.message : 'error de red';
    }
    await sleep(PAUSE_MS * attempt * 4);
  }
  throw new Error(`${url}: ${lastError}`);
}

/** Every indicator the collection publishes, with the unit it declares. */
async function readCatalogue(): Promise<CatalogueEntry[]> {
  const url = `${WORLD_BANK_API}/indicator?format=json&source=${WDI_SOURCE}&per_page=2000`;
  const { parsed } = await fetchJson(url);
  const page = parsed as [unknown, CataloguePayload[]];
  return (page[1] ?? []).map((row) => ({
    id: row.id ?? '',
    name: row.name ?? '',
    unit: row.unit ?? '',
    sourceNote: (row.sourceNote ?? '').slice(0, 600),
  }));
}

async function readSeries(entry: CatalogueEntry): Promise<Series | undefined> {
  const countries = PANEL_COUNTRIES.join(';');
  const sourceUrl =
    `${WORLD_BANK_API}/country/${countries}/indicator/${entry.id}` +
    `?format=json&per_page=${PAGE_SIZE}&source=${WDI_SOURCE}`;
  const { bytes, parsed } = await fetchJson(sourceUrl);
  const page = parsed as [Record<string, unknown>, Observation[] | null];
  const rows = page[1] ?? [];

  const points: Array<readonly [string, number, number]> = [];
  for (const row of rows) {
    if (row.value === null || row.value === undefined) continue;
    const year = Number(row.date);
    if (!Number.isInteger(year)) continue;
    const country = row.countryiso3code?.trim();
    if (!country) continue;
    points.push([country, year, row.value]);
  }
  if (points.length === 0) return undefined;

  return {
    indicatorCode: entry.id,
    indicatorName: entry.name,
    sourceUrl,
    sha256: createHash('sha256').update(bytes).digest('hex'),
    points,
  };
}

function writeSlice(index: number, series: readonly Series[], recordedAt: string): number {
  const observations = series.reduce((sum, one) => sum + one.points.length, 0);
  const name = `panel-${String(index).padStart(3, '0')}.json`;
  writeFileSync(
    join(SEEDS, name),
    `${JSON.stringify(
      {
        provenance: { recordedAt, publisher: PUBLISHER, domain: PUBLISHER_DOMAIN },
        countries: PANEL_COUNTRIES,
        series,
      },
      null,
      0,
    )}\n`,
    'utf8',
  );
  return observations;
}

async function main(): Promise<void> {
  mkdirSync(SEEDS, { recursive: true });
  const recordedAt = new Date().toISOString().replace(/\.\d+Z$/u, 'Z');
  const catalogue = await readCatalogue();
  console.log(
    `catálogo: ${catalogue.length} indicadores · ${PANEL_COUNTRIES.length} economías · ` +
      `${Math.ceil(catalogue.length / INDICATORS_PER_FILE)} archivos`,
  );

  let held: Series[] = [];
  let slice = 0;
  let observations = 0;
  let empty = 0;
  let failed = 0;

  for (const [index, entry] of catalogue.entries()) {
    try {
      const series = await readSeries(entry);
      if (series) held.push(series);
      else empty += 1;
    } catch {
      failed += 1;
    }
    await sleep(PAUSE_MS);

    const last = index === catalogue.length - 1;
    if (held.length >= INDICATORS_PER_FILE || (last && held.length > 0)) {
      observations += writeSlice(slice, held, recordedAt);
      console.log(
        `  archivo ${String(slice).padStart(3, '0')}: ${held.length} series · ` +
          `${observations.toLocaleString('es-BO')} observaciones acumuladas ` +
          `(${index + 1}/${catalogue.length})`,
      );
      held = [];
      slice += 1;
    }
  }

  console.log(
    `\n${observations.toLocaleString('es-BO')} observaciones en ${slice} archivos · ` +
      `${empty} indicadores sin datos · ${failed} fallidos`,
  );
  if (failed > 0) process.exitCode = 2;
}

main().catch((error: unknown) => {
  process.stderr.write(`${error instanceof Error ? error.message : 'Panel collection failed'}\n`);
  process.exitCode = 1;
});
