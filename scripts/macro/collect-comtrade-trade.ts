import { createHash } from 'node:crypto';
import { writeFileSync } from 'node:fs';
import { join } from 'node:path';

/**
 * Captures Bolivia's declared foreign trade from the United Nations register.
 *
 * The observatory already carried exports and imports, but only as the balance
 * of payments states them: an estimate built for a national accounts identity,
 * revised with the rest of the accounts. This is the other measurement of the
 * same thing — what customs recorded crossing the border, as Bolivia itself
 * reported it to the United Nations. The two do not agree, and should not: one
 * counts goods and services on an ownership basis, the other counts goods at
 * the frontier. A reader who can see both can see the size of that gap, which
 * is the part no single series can tell them.
 *
 * The register answers one year per request and refuses more, so each year is
 * its own retrieval and carries its own address and digest rather than
 * inheriting a series-wide one that would not reproduce it. That is the reason
 * this corpus has its own file shape instead of joining the annual macro seeds.
 *
 * Run with `yarn trade:collect`.
 */

const BASE = 'https://comtradeapi.un.org/public/v1/preview/C/A/HS';
/** Bolivia's reporter code in the register's own country list. */
const REPORTER = 68;
const PUBLISHER = 'NACIONES UNIDAS';
const UA = 'Mozilla/5.0 (compatible; ObservatorioEconomicoBO/1.0)';
const SEED = join('src', 'database', 'seeds', 'boot', 'foreign-trade.json');
/** First year the register holds a Bolivian declaration. */
const FIRST_YEAR = 1992;
/** The preview endpoint is rate limited; this keeps the run inside its budget. */
const PAUSE_MS = 1_500;
const ATTEMPTS = 4;

interface Row {
  readonly motCode: number;
  readonly customsCode: string;
  readonly partner2Code: number;
  readonly primaryValue: number;
}

interface Flow {
  readonly code: 'X' | 'M';
  readonly indicatorCode: string;
  readonly name: string;
}

const FLOWS: readonly Flow[] = [
  {
    code: 'X',
    indicatorCode: 'COMTRADE_GOODS_EXPORTS_USD',
    name: 'Exportaciones de bienes declaradas ante Naciones Unidas',
  },
  {
    code: 'M',
    indicatorCode: 'COMTRADE_GOODS_IMPORTS_USD',
    name: 'Importaciones de bienes declaradas ante Naciones Unidas',
  },
];

function sleep(milliseconds: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, milliseconds));
}

/**
 * The whole-year total, not one way of carrying it.
 *
 * The register breaks a year down by mode of transport, customs procedure and
 * second partner, and every breakdown is a real number. Summing them or taking
 * the first would both be wrong; the register states the total itself as the
 * row where all three breakdowns collapse, and that is the only row this reads.
 */
function aggregateRow(rows: readonly Row[]): Row | undefined {
  return rows.find(
    (row) => row.motCode === 0 && row.customsCode === 'C00' && row.partner2Code === 0,
  );
}

async function fetchYear(flow: Flow, year: number): Promise<{ bytes: Buffer; url: string }> {
  const url =
    `${BASE}?reporterCode=${REPORTER}&period=${year}` +
    `&partnerCode=0&cmdCode=TOTAL&flowCode=${flow.code}`;
  let failure = 'sin intentos';
  for (let attempt = 1; attempt <= ATTEMPTS; attempt += 1) {
    try {
      const response = await fetch(url, {
        headers: { 'User-Agent': UA },
        signal: AbortSignal.timeout(45_000),
      });
      if (response.ok) return { bytes: Buffer.from(await response.arrayBuffer()), url };
      failure = `respondio ${response.status}`;
    } catch (error: unknown) {
      failure = error instanceof Error ? error.message : 'fallo de red';
    }
    await sleep(PAUSE_MS * attempt * 2);
  }
  throw new Error(`${flow.code} ${year}: el registro ${failure} tras ${ATTEMPTS} intentos`);
}

async function collectFlow(flow: Flow, closed: number, retrievedAt: string): Promise<unknown> {
  const points: unknown[] = [];
  for (let year = FIRST_YEAR; year <= closed; year += 1) {
    const { bytes, url } = await fetchYear(flow, year);
    const parsed = JSON.parse(bytes.toString('utf-8')) as { data?: readonly Row[] };
    const row = aggregateRow(parsed.data ?? []);
    if (row === undefined) {
      console.warn(`  ${flow.code} ${year}: el registro no declara un total, omitido`);
      await sleep(PAUSE_MS);
      continue;
    }
    points.push({
      period: String(year),
      value: String(row.primaryValue),
      excerpt: JSON.stringify(row),
      sourceUrl: url,
      upstreamSha256: createHash('sha256').update(bytes).digest('hex'),
      retrievedAt,
    });
    // One line per year: the run is long and mostly waiting, and an operator
    // watching it needs to see which year is slow rather than a silent hour.
    console.log(`  ${flow.code} ${year}  ${row.primaryValue}`);
    await sleep(PAUSE_MS);
  }
  if (!points.length) throw new Error(`${flow.indicatorCode}: ninguna observacion utilizable`);
  console.log(`  ${flow.indicatorCode.padEnd(30)} ${String(points.length).padStart(3)} puntos`);

  return {
    indicatorCode: flow.indicatorCode,
    compilerCode: `TOTAL_${flow.code}`,
    name: flow.name,
    unit: 'USD',
    publisher: PUBLISHER,
    frequency: 'ANNUAL',
    points,
  };
}

async function main(): Promise<void> {
  const retrievedAt = `${new Date().toISOString().slice(0, 19)}Z`;
  const closed = new Date().getUTCFullYear() - 1;
  console.log(`\nforeign-trade.json  (${FIRST_YEAR}-${closed})`);
  const series: unknown[] = [];
  for (const flow of FLOWS) series.push(await collectFlow(flow, closed, retrievedAt));
  writeFileSync(SEED, `${JSON.stringify({ series }, null, 2)}\n`, 'utf-8');
  console.log(`  -> ${series.length} series escritas`);
}

main().catch((error: unknown) => {
  process.stderr.write(
    `${error instanceof Error ? error.message : 'Comtrade collection failed'}\n`,
  );
  process.exitCode = 1;
});
