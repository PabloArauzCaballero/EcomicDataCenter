import { createHash } from 'node:crypto';
import { existsSync, readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';

/**
 * Captures the quotations the Banco Central publishes on its own front page.
 *
 * Two figures the observatory was missing, both from the institution that
 * defines them rather than from a proxy: the UFV, which is the unit half of
 * Bolivian contracts are written in, and the bank's gold valuation in dollars
 * per troy ounce — the number the country's own reserves are marked against,
 * which a tokenised claim traded on an exchange is not.
 *
 * The bank publishes today's table and no archive that can be read without
 * driving a form, so this accumulates: each run appends the day it finds and
 * leaves the days already held untouched. The series therefore starts on the
 * day this first ran and grows forward, which the seed states plainly rather
 * than implying a history it does not have.
 *
 * Run with `yarn bcb:collect`.
 */

const SEED = join('src', 'database', 'seeds', 'boot', 'bcb-quotes.json');
const HOME = 'https://www.bcb.gob.bo/';
const UA = 'Mozilla/5.0 (compatible; ObservatorioEconomicoBO/1.0)';

const MONTHS: Record<string, number> = {
  enero: 1,
  febrero: 2,
  marzo: 3,
  abril: 4,
  mayo: 5,
  junio: 6,
  julio: 7,
  agosto: 8,
  septiembre: 9,
  setiembre: 9,
  octubre: 10,
  noviembre: 11,
  diciembre: 12,
};

interface Quote {
  indicatorCode: string;
  indicatorName: string;
  unit: string;
  eventDate: string;
  value: string;
  /** The figure exactly as the bank prints it. */
  statedValue: string;
  /** The literal fragment the figure was read from. */
  excerpt: string;
  sourceUrl: string;
  documentSha256: string;
  retrievedAt: string;
}

/** Bolivian thousands are dots and the decimal is a comma. */
const toNumber = (raw: string): string | null => {
  const cleaned = raw.replace(/\./gu, '').replace(',', '.');
  return /^\d+(\.\d+)?$/u.test(cleaned) ? cleaned : null;
};

/** The date the quotation table states above itself. */
function tableDate(text: string): string | null {
  const match = text.match(
    /Tabla de cotizaciones[\s\S]{0,200}?(\d{1,2})\s+de\s+([a-záéíóú]+),?\s+(?:de\s+)?(\d{4})/iu,
  );
  if (!match) return null;
  const [, day, month, year] = match;
  const monthNumber = month === undefined ? undefined : MONTHS[month.toLowerCase()];
  if (!monthNumber || !day || !year) return null;
  return `${year}-${String(monthNumber).padStart(2, '0')}-${day.padStart(2, '0')}`;
}

const TARGETS: ReadonlyArray<{
  readonly label: string;
  readonly code: string;
  readonly name: string;
  readonly unit: string;
}> = [
  { label: 'Oro', code: 'GOLD_USD_OZT', name: 'Oro', unit: 'USD/OZT' },
  { label: 'UFV', code: 'UFV_BOB', name: 'Unidad de Fomento de Vivienda', unit: 'BOB/UFV' },
];

async function main(): Promise<void> {
  const response = await fetch(HOME, {
    headers: { 'User-Agent': UA },
    signal: AbortSignal.timeout(45_000),
  });
  if (!response.ok) throw new Error(`El BCB respondió ${response.status}`);
  const bytes = Buffer.from(await response.arrayBuffer());
  const digest = createHash('sha256').update(bytes).digest('hex');
  const flat = bytes
    .toString('utf-8')
    .replace(/<[^>]+>/gu, ' | ')
    .replace(/\s+/gu, ' ')
    // Collapse the runs of separators nested markup leaves behind, so a label,
    // its unit and its figure are adjacent fields rather than a wall of pipes.
    .replace(/(?:\|\s*){2,}/gu, '| ');

  const eventDate = tableDate(flat);
  if (!eventDate) throw new Error('La tabla de cotizaciones no declaró su fecha');
  const retrievedAt = `${new Date().toISOString().slice(0, 19)}Z`;

  const found: Quote[] = [];
  for (const target of TARGETS) {
    // Label, then its unit, then the figure — the order the table renders.
    const pattern = new RegExp(
      `\\|\\s*${target.label}\\s*\\|[^|]{0,30}\\|\\s*([\\d.,]+)\\s*\\|`,
      'u',
    );
    const match = flat.match(pattern);
    const value = match?.[1] === undefined ? null : toNumber(match[1]);
    if (!value) {
      console.warn(`  ${target.code}: no se encontró en la tabla, omitido`);
      continue;
    }
    found.push({
      indicatorCode: target.code,
      indicatorName: target.name,
      unit: target.unit,
      eventDate,
      value,
      statedValue: (match?.[1] ?? '').trim(),
      excerpt: (match?.[0] ?? '').trim().slice(0, 300),
      sourceUrl: HOME,
      documentSha256: digest,
      retrievedAt,
    });
    console.log(`  ${target.code.padEnd(13)} ${value} ${target.unit}  (${eventDate})`);
  }
  if (!found.length) throw new Error('Ninguna cotización pudo leerse');

  // Append-only: a day already held is never rewritten, because a quotation the
  // bank published is not ours to revise.
  const held: Quote[] = existsSync(SEED)
    ? ((JSON.parse(readFileSync(SEED, 'utf-8')) as { quotes?: Quote[] }).quotes ?? [])
    : [];
  const seen = new Set(held.map((quote) => `${quote.indicatorCode}|${quote.eventDate}`));
  const added = found.filter((quote) => !seen.has(`${quote.indicatorCode}|${quote.eventDate}`));
  const quotes = [...held, ...added].sort(
    (left, right) =>
      left.eventDate.localeCompare(right.eventDate) ||
      left.indicatorCode.localeCompare(right.indicatorCode),
  );

  writeFileSync(SEED, `${JSON.stringify({ quotes }, null, 2)}\n`, 'utf-8');
  console.log(
    `\n${added.length} cotizaciones nuevas; ${quotes.length} en total desde ${quotes[0]?.eventDate}`,
  );
}

main().catch((error: unknown) => {
  process.stderr.write(`${error instanceof Error ? error.message : 'BCB collection failed'}\n`);
  process.exitCode = 1;
});
