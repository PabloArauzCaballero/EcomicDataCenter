import { createHash } from 'node:crypto';
import { mkdirSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import {
  PUBLISHER,
  PUBLISHER_DOMAIN,
  USER_AGENT,
  WDI_SOURCE,
  WORLD_AGGREGATES,
  WORLD_BANK_API,
  WORLD_BOARD_INDICATORS,
} from './worldbank-panel-sources';

/**
 * Captures the world and its regions for the indicators the world board reads.
 *
 * The panel answers "how does Bolivia compare with its neighbours". The board
 * answers a different question — how is the world doing, and where does Bolivia
 * sit in it — and that needs the figures the World Bank computes for the world
 * and for each region, which the panel never asked for.
 *
 * The file is written beside the panel's own slices and in exactly their
 * shape, so the loader that reads them needs nothing new: it reads every file
 * in the directory, in name order, and skips any payload it already holds.
 * Bolivia is deliberately not requested here. The panel already carries it,
 * and asking again would register every Bolivian figure a second time under a
 * different source address.
 *
 * One request per indicator for all eight aggregates at once, each with its own
 * address and its own digest over the bytes that address returned, for the same
 * reason the panel does it: that is what lets a reader fetch the URL beside a
 * figure and hash the same answer.
 *
 * Run with `yarn macro:world`. A request that fails after its retries stops the
 * run before anything is written, so the file on disk is always a whole
 * collection and never the first half of one.
 */

const SEEDS = join('src', 'database', 'seeds', 'boot', 'worldbank-panel');
const FILE = 'world-000.json';
/** One page holds every year of all eight aggregates at this size. */
const PAGE_SIZE = 20_000;
const PAUSE_MS = 120;
const ATTEMPTS = 4;

/** An observation as the register serves it, before any field is trusted. */
interface RegisterRow {
  readonly countryiso3code?: string;
  readonly date?: string;
  readonly value?: number | null;
  readonly indicator?: { readonly value?: string };
}

interface Series {
  readonly indicatorCode: string;
  readonly indicatorName: string;
  readonly sourceUrl: string;
  readonly sha256: string;
  /** [ISO3, year, value] — the shape the panel's slices already use. */
  readonly points: ReadonlyArray<readonly [string, number, number]>;
}

const sleep = (ms: number): Promise<void> => new Promise((resolve) => setTimeout(resolve, ms));

async function fetchBytes(url: string): Promise<Buffer> {
  let lastError = 'sin respuesta';
  for (let attempt = 1; attempt <= ATTEMPTS; attempt += 1) {
    try {
      const response = await fetch(url, { headers: { 'user-agent': USER_AGENT } });
      if (response.ok) return Buffer.from(await response.arrayBuffer());
      lastError = `HTTP ${response.status}`;
    } catch (error) {
      lastError = error instanceof Error ? error.message : 'error de red';
    }
    await sleep(PAUSE_MS * attempt * 4);
  }
  throw new Error(`${url}: ${lastError}`);
}

async function readWorldSeries(indicatorCode: string): Promise<Series | undefined> {
  const sourceUrl =
    `${WORLD_BANK_API}/country/${WORLD_AGGREGATES.join(';')}/indicator/${indicatorCode}` +
    `?format=json&per_page=${PAGE_SIZE}&source=${WDI_SOURCE}`;
  const bytes = await fetchBytes(sourceUrl);
  const page = JSON.parse(bytes.toString('utf8')) as [unknown, RegisterRow[] | null];
  const wanted = new Set(WORLD_AGGREGATES);

  let indicatorName = '';
  const points: Array<readonly [string, number, number]> = [];
  for (const row of page[1] ?? []) {
    if (!indicatorName) indicatorName = row.indicator?.value?.trim() ?? '';
    if (row.value === null || row.value === undefined) continue;
    const year = Number(row.date);
    if (!Number.isInteger(year)) continue;
    // The register answers with the codes it was asked for. Anything else in
    // the page is not a figure this file claims to hold, so it is not kept.
    const place = row.countryiso3code?.trim() ?? '';
    if (!wanted.has(place)) continue;
    points.push([place, year, row.value]);
  }
  if (points.length === 0 || !indicatorName) return undefined;

  return {
    indicatorCode,
    indicatorName,
    sourceUrl,
    sha256: createHash('sha256').update(bytes).digest('hex'),
    points,
  };
}

async function main(): Promise<void> {
  const recordedAt = new Date().toISOString().replace(/\.\d+Z$/u, 'Z');
  const series: Series[] = [];
  const empty: string[] = [];

  for (const indicatorCode of WORLD_BOARD_INDICATORS) {
    const one = await readWorldSeries(indicatorCode);
    if (one) {
      series.push(one);
      const places = new Set(one.points.map(([place]) => place)).size;
      console.log(
        `  ${indicatorCode.padEnd(24)} ${one.points.length} puntos · ${places} agregados`,
      );
    } else {
      empty.push(indicatorCode);
      console.log(`  ${indicatorCode.padEnd(24)} sin datos`);
    }
    await sleep(PAUSE_MS);
  }

  mkdirSync(SEEDS, { recursive: true });
  writeFileSync(
    join(SEEDS, FILE),
    `${JSON.stringify({
      provenance: { recordedAt, publisher: PUBLISHER, domain: PUBLISHER_DOMAIN },
      countries: WORLD_AGGREGATES,
      series,
    })}\n`,
    'utf8',
  );

  const total = series.reduce((sum, one) => sum + one.points.length, 0);
  console.log(
    `\n${total.toLocaleString('es-BO')} puntos en ${series.length} series · ` +
      `${WORLD_AGGREGATES.length} agregados · ${empty.length} indicadores sin datos → ${FILE}`,
  );
  if (empty.length > 0) process.exitCode = 2;
}

main().catch((error: unknown) => {
  process.stderr.write(`${error instanceof Error ? error.message : 'World collection failed'}\n`);
  process.exitCode = 1;
});
