import { existsSync, readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { FAO_DOMESTIC } from './exogenous-sources-fao';
import { FAO_INTERNATIONAL } from './exogenous-sources-neighbours';
import { MONTHLY_SERIES } from './exogenous-sources';
import type { ExogenousSpec } from './exogenous-sources';
import {
  faoSeries,
  fredSeries,
  sleep,
  worldBankColumns,
  worldBankWorkbook,
} from './exogenous-readers';
import type { Download, MonthlyPoint } from './exogenous-readers';

/**
 * Recoge los precios mensuales que Bolivia no fija: `yarn exogenous:collect`.
 *
 * Tres publicadores y una sola semilla. El Banco Mundial da en un cuaderno las
 * cotizaciones mundiales de energía, metales, granos y fertilizantes; FRED da
 * las de gasolina, diésel y propano, y los índices de productor de las
 * resinas, el cemento y el acero, que no tienen cotización abierta; FAO/GIEWS
 * da los precios dentro de Bolivia en bolivianos y las cotizaciones de los
 * vecinos. Los tres se promedian al mes y el mes en curso no entra.
 *
 * El archivo sólo se reescribe si alguna cifra cambió. La corrida va en el
 * lote diario y estos publicadores actualizan una vez al mes: reescribir la
 * semilla con otra hora de descarga y las mismas cifras despertaría un
 * despliegue por nada, tres veces al día.
 *
 * Una fuente que falla no tumba a las otras: su serie se conserva como estaba
 * en la semilla anterior y la corrida lo dice. Una serie que se queda un mes
 * atrás es mejor que un capítulo vacío.
 */

const SEED = join('src', 'database', 'seeds', 'boot', 'exogenous-prices.json');

const PUBLISHERS: Record<ExogenousSpec['origin']['kind'], string> = {
  WORLD_BANK: 'BANCO MUNDIAL (PINK SHEET)',
  FRED: 'FRED, BANCO DE LA RESERVA FEDERAL DE SAN LUIS',
  FAO: 'FAO, SISTEMA MUNDIAL DE INFORMACIÓN Y ALERTA (GIEWS)',
};

interface SeedSeries {
  readonly indicatorCode: string;
  readonly provenance: { sourceUrl: string; upstreamSha256: string; retrievedAt: string };
  readonly points: readonly MonthlyPoint[];
  readonly [field: string]: unknown;
}

function seriesOf(
  spec: ExogenousSpec,
  file: Download,
  points: readonly MonthlyPoint[],
  at: string,
): SeedSeries {
  return {
    indicatorCode: spec.code,
    group: spec.group,
    product: spec.product,
    productLabel: spec.productLabel,
    name: spec.name,
    scope: spec.scope,
    market: spec.market,
    unit: spec.unit,
    kind: spec.kind,
    note: spec.note,
    publisher: PUBLISHERS[spec.origin.kind],
    frequency: 'MONTHLY',
    provenance: { sourceUrl: file.url, upstreamSha256: file.sha256, retrievedAt: at },
    points,
  };
}

function previousSeed(): Map<string, SeedSeries> {
  if (!existsSync(SEED)) return new Map();
  const parsed = JSON.parse(readFileSync(SEED, 'utf-8')) as { series: SeedSeries[] };
  return new Map(parsed.series.map((series) => [series.indicatorCode, series]));
}

/** Las cifras de una serie, sin la hora ni la huella de la descarga. */
const figures = (series: SeedSeries): string => JSON.stringify({ ...series, provenance: null });

async function collect(previous: Map<string, SeedSeries>): Promise<SeedSeries[]> {
  const at = `${new Date().toISOString().slice(0, 19)}Z`;
  const out: SeedSeries[] = [];
  const keep = (spec: ExogenousSpec, why: string) => {
    const old = previous.get(spec.code);
    console.log(`  ${spec.code.padEnd(34)} ${why}${old ? ' — se conserva la anterior' : ''}`);
    if (old) out.push(old);
  };

  let bank: { file: Download; columns: Map<string, MonthlyPoint[]> } | null = null;
  try {
    const file = await worldBankWorkbook();
    bank = { file, columns: worldBankColumns(file) };
  } catch (error: unknown) {
    console.log(`  Banco Mundial: ${error instanceof Error ? error.message : 'ilegible'}`);
  }

  for (const spec of [...MONTHLY_SERIES, ...FAO_INTERNATIONAL, ...FAO_DOMESTIC]) {
    const origin = spec.origin;
    try {
      if (origin.kind === 'WORLD_BANK') {
        const points = bank?.columns.get(origin.column.trim());
        if (!bank || !points?.length) {
          keep(spec, `sin la columna «${origin.column.trim()}»`);
          continue;
        }
        out.push(seriesOf(spec, bank.file, points, at));
        continue;
      }
      const read =
        origin.kind === 'FRED' ? await fredSeries(origin.id) : await faoSeries(origin.uuid);
      if (!read.points.length) keep(spec, 'sin puntos');
      else out.push(seriesOf(spec, read.file, read.points, at));
      await sleep(400);
    } catch (error: unknown) {
      keep(spec, error instanceof Error ? error.message : 'ilegible');
    }
  }
  return out;
}

async function main(): Promise<void> {
  console.log('\nexogenous-prices.json');
  const previous = previousSeed();
  const series = await collect(previous);
  const changed =
    series.length !== previous.size ||
    series.some((one) => {
      const old = previous.get(one.indicatorCode);
      return !old || figures(old) !== figures(one);
    });
  const total = series.reduce((count, one) => count + one.points.length, 0);
  if (!changed) {
    console.log(`  sin cambios en ${series.length} series; la semilla queda como estaba`);
    return;
  }
  writeFileSync(SEED, `${JSON.stringify({ series }, null, 2)}\n`, 'utf-8');
  console.log(`  -> ${series.length} series, ${total} observaciones`);
}

main().catch((error: unknown) => {
  process.stderr.write(
    `${error instanceof Error ? error.message : 'exogenous collection failed'}\n`,
  );
  process.exitCode = 1;
});
