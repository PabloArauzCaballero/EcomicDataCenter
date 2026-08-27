import { createHash } from 'node:crypto';
import { existsSync, readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';

/**
 * Captures the yield curve the Bolsa Boliviana de Valores publishes each day.
 *
 * This is the piece the observatory was missing outright. It held a single
 * annual figure about sovereign bonds — the net flow the multilateral compiler
 * reports — and nothing at all about what those bonds actually yield, which is
 * the number anyone asking about sovereign debt means. The exchange publishes
 * it: one rate per instrument, issuer, currency, operation and maturity band,
 * for the session that just closed.
 *
 * Sovereign is not a separate table here, it is an issuer. `TGN` is the Tesoro
 * General de la Nación and `BCB` is the central bank; the rest are banks and
 * corporates quoting against them, which is exactly the comparison that makes a
 * sovereign yield mean something. Filtering them out at collection would throw
 * away the spread.
 *
 * The exchange serves the closing session and no archive — its own date filter
 * is commented out of the page — so this accumulates the way the central bank's
 * quotations do: each run appends the session it finds and leaves the sessions
 * already held untouched. The series therefore starts the day this first ran
 * and grows forward, which the seed states plainly rather than implying a
 * history it does not have.
 *
 * Run with `yarn bbv:yields`.
 */

const SEED = join('src', 'database', 'seeds', 'boot', 'bbv-yields.json');
const PAGE = 'https://www.bbv.com.bo/mercados/tasas-de-rendimiento/';
const UA = 'Mozilla/5.0 (compatible; ObservatorioEconomicoBO/1.0)';

const MONTHS: Record<string, number> = {
  ENE: 1,
  FEB: 2,
  MAR: 3,
  ABR: 4,
  MAY: 5,
  JUN: 6,
  JUL: 7,
  AGO: 8,
  SEP: 9,
  OCT: 10,
  NOV: 11,
  DIC: 12,
};

/** How the exchange labels the two sides of its own table. */
const OPERATIONS: Record<string, string> = { fcv: 'COMPRAVENTA', frpt: 'REPORTO' };

interface YieldPoint {
  readonly eventDate: string;
  /** ISO code of the currency the rate is quoted in: BOB, USD or UFV. */
  readonly currency: string;
  readonly operation: string;
  /** Whether the exchange files the paper as serialised or not. */
  readonly segment: string;
  /** Instrument code as the exchange publishes it: BTS, BLP, CUP, DPF, PGB, BBB. */
  readonly instrument: string;
  /** Issuer code, empty on the exchange's own aggregate rows. */
  readonly issuer: string;
  /** Maturity band in days, exactly as the column is headed. */
  readonly tenorBucket: string;
  readonly value: string;
  /** The figure exactly as the exchange prints it, per cent sign included. */
  readonly statedValue: string;
  readonly excerpt: string;
  readonly sourceUrl: string;
  readonly documentSha256: string;
  readonly retrievedAt: string;
}

/** `26AGO2026` as the table heads itself, to the calendar order everything else uses. */
function sessionDate(page: string): string | null {
  const match = /TASAS DE RENDIMIENTO\s*-\s*(\d{1,2})([A-ZÁÉÍÓÚ]{3})(\d{4})/iu.exec(page);
  if (!match) return null;
  const [, day, month, year] = match;
  const monthNumber = month === undefined ? undefined : MONTHS[month.toUpperCase()];
  if (!monthNumber || !day || !year) return null;
  return `${year}-${String(monthNumber).padStart(2, '0')}-${day.padStart(2, '0')}`;
}

const stripTags = (html: string): string =>
  html
    .replace(/<[^>]+>/gu, '')
    .replace(/&nbsp;/gu, ' ')
    .replace(/&amp;/gu, '&')
    .trim();

/** Cells of one row of the exchange's list markup, in column order. */
function cells(list: string): string[] {
  return [...list.matchAll(/<li[^>]*>([\s\S]*?)<\/li>/gu)].map((item) => stripTags(item[1] ?? ''));
}

const attribute = (tag: string, name: string): string =>
  new RegExp(`${name}="([^"]*)"`, 'u').exec(tag)?.[1]?.trim() ?? '';

/**
 * The block of the page holding one currency and one side of the market.
 *
 * The exchange renders every combination into the same document and hides all
 * but one with a class, so the block has to be cut out by its container id
 * rather than by what happens to be visible.
 */
function operationBlock(page: string, operation: string, currency: string): string | null {
  const opening = `id="${operation}-${currency}"`;
  const start = page.indexOf(opening);
  if (start < 0) return null;
  const next = page.indexOf('content-foperacion', start + opening.length);
  const boundary = page.indexOf('id="', next < 0 ? page.length : next);
  return page.slice(start, boundary < 0 ? page.length : boundary);
}

function readBlock(
  block: string,
  eventDate: string,
  currency: string,
  operation: string,
  documentSha256: string,
  retrievedAt: string,
): YieldPoint[] {
  const points: YieldPoint[] = [];
  // The header names the maturity bands, so the columns are read from the page
  // rather than assumed: the exchange uses different bands for reporto.
  const header = /<ul class="bursatil-data-list is-header"[^>]*>([\s\S]*?)<\/ul>/u.exec(block);
  if (!header) return points;
  const columns = cells(header[0]);

  let segment = '';
  for (const match of block.matchAll(
    /<p class="data-bursatil__information-title[^"]*">([\s\S]*?)<\/p>|<ul class="bursatil-data-list is-data[^"]*"([^>]*)>([\s\S]*?)<\/ul>/gu,
  )) {
    if (match[1] !== undefined) {
      segment = stripTags(match[1]);
      continue;
    }
    const attributes = match[2] ?? '';
    const values = cells(`<ul>${match[3] ?? ''}</ul>`);
    const instrument = attribute(attributes, 'data-instrumento');
    const issuer = attribute(attributes, 'data-emisor');
    if (!instrument) continue;

    // Column zero is the instrument and column one the issuer; the rest are the
    // maturity bands the header just named.
    for (let column = 2; column < columns.length; column += 1) {
      const statedValue = values[column]?.trim() ?? '';
      const figure = /^(\d+(?:\.\d+)?)%$/u.exec(statedValue);
      const tenorBucket = columns[column];
      if (!figure?.[1] || !tenorBucket) continue;
      points.push({
        eventDate,
        currency,
        operation,
        segment,
        instrument,
        issuer,
        tenorBucket,
        value: figure[1],
        statedValue,
        excerpt:
          `TASAS DE RENDIMIENTO - ${eventDate} - ${currency} ${operation} ${segment}: ` +
          `${instrument}${issuer ? `/${issuer}` : ''} ${tenorBucket} dias ${statedValue}`,
        sourceUrl: PAGE,
        documentSha256,
        retrievedAt,
      });
    }
  }
  return points;
}

async function main(): Promise<void> {
  const response = await fetch(PAGE, {
    headers: { 'User-Agent': UA },
    signal: AbortSignal.timeout(60_000),
  });
  if (!response.ok) throw new Error(`La BBV respondio ${response.status}`);
  const bytes = Buffer.from(await response.arrayBuffer());
  const documentSha256 = createHash('sha256').update(bytes).digest('hex');
  const page = bytes.toString('utf-8');

  const eventDate = sessionDate(page);
  if (!eventDate) throw new Error('La tabla de tasas no declaro su fecha');
  const retrievedAt = `${new Date().toISOString().slice(0, 19)}Z`;

  const found: YieldPoint[] = [];
  for (const currency of ['BOB', 'USD', 'UFV']) {
    for (const [prefix, operation] of Object.entries(OPERATIONS)) {
      const block = operationBlock(page, prefix, currency);
      if (!block) continue;
      const points = readBlock(block, eventDate, currency, operation, documentSha256, retrievedAt);
      console.log(`  ${currency} ${operation.padEnd(11)} ${points.length} tasas`);
      found.push(...points);
    }
  }
  if (!found.length) {
    console.warn(`La sesion del ${eventDate} no publico ninguna tasa; no se escribe nada`);
    return;
  }

  const sovereign = found.filter((point) => point.issuer === 'TGN' || point.issuer === 'BCB');
  console.log(`\n${found.length} tasas, de las cuales ${sovereign.length} soberanas (TGN/BCB)`);

  // Append-only: a session already held is never rewritten, because a rate the
  // exchange published is not ours to revise.
  const held: YieldPoint[] = existsSync(SEED)
    ? ((JSON.parse(readFileSync(SEED, 'utf-8')) as { yields?: YieldPoint[] }).yields ?? [])
    : [];
  const key = (point: YieldPoint): string =>
    [
      point.eventDate,
      point.currency,
      point.operation,
      point.instrument,
      point.issuer,
      point.tenorBucket,
    ].join('|');
  const seen = new Set(held.map(key));
  const added = found.filter((point) => !seen.has(key(point)));
  const yields = [...held, ...added].sort((left, right) => key(left).localeCompare(key(right)));

  writeFileSync(SEED, `${JSON.stringify({ yields }, null, 2)}\n`, 'utf-8');
  console.log(
    `${added.length} tasas nuevas; ${yields.length} en total desde ${yields[0]?.eventDate}`,
  );
}

main().catch((error: unknown) => {
  process.stderr.write(`${error instanceof Error ? error.message : 'BBV collection failed'}\n`);
  process.exitCode = 1;
});
