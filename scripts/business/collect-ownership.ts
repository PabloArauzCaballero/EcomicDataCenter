import { codeOf, writeSeed } from './business-common';
import { bankEquity } from './ownership-equity';
import { firmEquity } from './ownership-equity-firms';
import { holderCode, holderKind, holderName, isHolder } from './ownership-holders';
import { BBV_FICHAS, FICHAS_WITHOUT_UNITS, OWNERSHIP_DOCUMENTS } from './ownership-documents';
import {
  readDocument,
  readFicha,
  shareValue,
  type DocumentReport,
  type Reading,
} from './ownership-readings';
import { OWNER_PREFIX, SEED_FILE, THRESHOLD } from './ownership-sources';
import type { RegisterPoint, RegisterSeries } from '../macro/annual-register-shape';

/**
 * Recoge quién es dueño de qué parte de las empresas grandes, año por año.
 *
 * Es la mitad de la estimación de fortunas que el tablero arma: patrimonio de
 * la empresa por participación del titular. Aquí está sólo la participación, y
 * sólo la que un documento del emisor o de su regulador imprime; la cadena
 * —una persona dueña de una sociedad que es dueña de un banco— se guarda
 * eslabón por eslabón, cada uno con su documento, y la compone el tablero.
 *
 * Cada año de una empresa sale de un solo documento, el de corte más reciente
 * de ese año: mezclar en un mismo año el cuadro de marzo de un prospecto con el
 * de junio de otro sumaría filas de dos fotos distintas.
 *
 * Se corre con
 * `node --max-old-space-size=700 node_modules/tsx/dist/cli.mjs scripts/business/collect-ownership.ts`.
 */

const BASIS =
  'Porcentaje del capital inscrito a nombre del titular en el cuadro de accionistas del documento, a la fecha de corte que declara. Participación directa: no suma la que tenga a través de otras sociedades. Es una cuota del capital, no un patrimonio ni un valor de mercado.';

/** Un código recortado, con la comprobación de que dos nombres no colapsan al mismo. */
class ShortCodes {
  private readonly seen = new Map<string, string>();

  of(full: string, length: number): string {
    const short = codeOf(full, length);
    const owner = this.seen.get(short);
    if (owner !== undefined && owner !== full)
      throw new Error(`«${full}» y «${owner}» dan el mismo código ${short}`);
    this.seen.set(short, full);
    return short;
  }
}

/** Por empresa y año, sólo las lecturas del documento de corte más reciente. */
function latestPerYear(readings: readonly Reading[]): Reading[] {
  const yearOf = (reading: Reading): string => `${reading.companySlug}|${reading.asOf.slice(0, 4)}`;
  const chosen = new Map<string, Reading>();
  for (const reading of readings) {
    const current = chosen.get(yearOf(reading));
    if (!current || reading.asOf > current.asOf) chosen.set(yearOf(reading), reading);
  }
  return readings.filter((reading) => {
    const best = chosen.get(yearOf(reading));
    return best?.asOf === reading.asOf && best.sourceUrl === reading.sourceUrl;
  });
}

function seriesOf(readings: readonly Reading[]): RegisterSeries[] {
  const holders = new ShortCodes();
  const companies = new ShortCodes();
  const book = new Map<string, RegisterSeries>();
  const pairs = new Map<string, Reading[]>();
  for (const reading of readings.filter((one) => isHolder(one.holder))) {
    const key = `${holderCode(holderName(reading.holder))}|${reading.companySlug}`;
    pairs.set(key, [...(pairs.get(key) ?? []), reading]);
  }
  for (const [key, group] of pairs) {
    if (!group.some((reading) => Number(shareValue(reading.printed)) >= THRESHOLD)) continue;
    const first = group[0];
    if (!first) continue;
    const holder = holderName(first.holder);
    const slug = key.split('|')[0] ?? '';
    const kind = holderKind(holder);
    const code = `${OWNER_PREFIX}${holders.of(slug, 34)}_${companies.of(first.companySlug, 33)}`;
    const tags = `{tipo=${kind}; titular=${slug}; empresa=${first.companySlug}; directa=si}`;
    const long = `${holder}: participación en ${first.companyName} ${tags}`;
    const points: RegisterPoint[] = [...group]
      .sort((left, right) => left.asOf.localeCompare(right.asOf))
      .map((reading) => ({
        period: reading.asOf.slice(0, 4),
        value: shareValue(reading.printed),
        excerpt: reading.excerpt,
        sourceUrl: reading.sourceUrl,
        upstreamSha256: reading.upstreamSha256,
        retrievedAt: reading.retrievedAt,
      }));
    if (new Set(points.map((point) => point.period)).size !== points.length) {
      throw new Error(`${code}: dos lecturas en un mismo año`);
    }
    book.set(code, {
      indicatorCode: code,
      name:
        long.length <= 200
          ? long
          : `${holder.slice(0, 200 - tags.length - 20)}: participación ${tags}`,
      group: slug,
      groupLabel: holder.slice(0, 120),
      measure: 'Participación accionaria directa en el capital',
      level: kind === 'persona' ? 'PERSON' : 'COMPANY',
      unit: 'PERCENT',
      basis: BASIS,
      publisher: [...new Set(group.map((reading) => reading.publisher))].join(' · ').slice(0, 200),
      frequency: 'ANNUAL',
      points,
    });
  }
  return [...book.values()].sort((left, right) =>
    left.indicatorCode.localeCompare(right.indicatorCode),
  );
}

async function main(): Promise<void> {
  const readings: Reading[] = [];
  const reports: DocumentReport[] = [];
  for (const [code, expected] of Object.entries(BBV_FICHAS)) {
    const { readings: found, report } = await readFicha(
      code,
      expected,
      !FICHAS_WITHOUT_UNITS.has(code),
    );
    readings.push(...found);
    reports.push(report);
  }
  for (const source of OWNERSHIP_DOCUMENTS) {
    const { readings: found, report } = await readDocument(source);
    readings.push(...found);
    reports.push(report);
  }
  for (const report of reports) {
    const gap = Math.abs(report.listed - 100);
    if (gap > 0.5)
      console.log(
        `  aviso: ${report.label} al ${report.asOf} lista ${report.listed.toFixed(2)}% en ${report.rows} filas`,
      );
  }
  const stakes = seriesOf(latestPerYear(readings));
  const banks = await bankEquity();
  const firms = await firmEquity();
  for (const gap of [...banks.gaps, ...firms.gaps]) console.log(`  hueco de patrimonio: ${gap}`);
  const equity = [...banks.series, ...firms.series];
  const series = [...stakes, ...equity].sort((left, right) =>
    left.indicatorCode.localeCompare(right.indicatorCode),
  );
  writeSeed(SEED_FILE, series);
  console.log(
    `  ${equity.length} series de patrimonio (${equity.reduce((sum, one) => sum + one.points.length, 0)} puntos)`,
  );
  const people = stakes.filter((one) => one.level === 'PERSON').length;
  console.log(`  ${people} series de personas; ${reports.length} documentos leídos`);
}

void main().catch((error: unknown) => {
  console.error(error instanceof Error ? error.message : error);
  process.exitCode = 1;
});
