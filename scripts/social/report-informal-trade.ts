import 'dotenv/config';
import { getEnvironment } from '../../src/config/environment';
import { createReaderDatabase } from '../../src/database/database.factory';

/**
 * Reads the commerce register the way a microeconomist would ask about it: by
 * the form of doing business, not by the platform a figure was published on.
 *
 * Four panels, and the order is the argument. First what the register can and
 * cannot say about each form of trade, because a panel that opens with numbers
 * invites the reader to assume the silences are zeros. Then the channel mix,
 * which is the only place where adding readings up means anything, and where
 * the sum passing 100 has to be explained rather than hidden. Then how the
 * money changes hands, which is what separates a sale that left a record from
 * one that did not. Last the distance against the measured series, which ADR
 * 0022 says is the reading that matters.
 *
 * Read-only, on the reader pool. Run with `yarn social:trade`.
 */

interface CoverageRow {
  business_form: string;
  market_regime: string;
  readings: string;
  high_grade: string;
  low_grade: string;
  compilers: string;
  territories: string;
  latest_period: string | null;
  unread: boolean;
}

interface MixRow {
  goods_class: string;
  territory: string;
  reference_period: string;
  readings: string;
  forms_read: string;
  one_reading_per_form: boolean;
  penetration_sum: string | null;
  channels_per_household: string | null;
  informal_share_of_visits: string | null;
}

interface SettlementRow {
  settlement_means: string;
  readings: string;
  label: string;
  value: string;
  unit: string;
  reference_period: string;
}

interface GapRow {
  label: string;
  social_value: string;
  reference_period: string;
  indicator_code: string;
  measured_value: string | null;
  measured_publisher: string | null;
  distance_points: string | null;
}

const COVERAGE = `
  SELECT business_form, market_regime, readings::text, high_grade::text, low_grade::text,
         compilers::text, territories::text, latest_period, unread
  FROM read_models.informal_trade_coverage
  ORDER BY market_regime, readings DESC, business_form
`;

const MIX = `
  SELECT goods_class, territory, reference_period, readings::text, forms_read::text,
         one_reading_per_form, penetration_sum::text, channels_per_household::text,
         informal_share_of_visits::text
  FROM read_models.informal_trade_channel_mix
  ORDER BY reference_period DESC, goods_class, territory
`;

/**
 * One row per reading, not an aggregate: a settlement share and a payment count
 * are different quantities, and a mean of them would describe nothing.
 */
const SETTLEMENT = `
  SELECT settlement_means, count(*) OVER (PARTITION BY settlement_means)::text AS readings,
         label, value::text, unit, reference_period
  FROM read_models.social_commerce
  WHERE settlement_means <> 'NINGUNO'
    AND status = 'PUBLISHED'
    AND NOT superseded
  ORDER BY settlement_means, reference_period DESC, label
`;

const GAP = `
  SELECT label, social_value::text, reference_period, indicator_code,
         round(measured_value, 2)::text AS measured_value, measured_publisher,
         distance_points::text
  FROM read_models.informal_trade_gap
  ORDER BY indicator_code, reference_period DESC
`;

function coveragePanel(rows: readonly CoverageRow[]): void {
  console.log('FORMAS DE HACER NEGOCIO');
  console.log('(una fila por forma de comercio; «sin lectura» es un hueco, no un cero)\n');
  console.log('forma                 régimen    lecturas  alta  baja  compil.  lugares  período');
  console.log('-'.repeat(88));
  for (const row of rows) {
    const period = row.unread ? 'sin lectura' : (row.latest_period ?? '?');
    console.log(
      `${row.business_form.padEnd(21)} ${row.market_regime.padEnd(9)} ` +
        `${row.readings.padStart(8)}  ${row.high_grade.padStart(4)}  ${row.low_grade.padStart(4)}  ` +
        `${row.compilers.padStart(7)}  ${row.territories.padStart(7)}  ${period}`,
    );
  }
}

function mixPanel(rows: readonly MixRow[]): void {
  console.log('\n\nCANALES POR CANASTA');
  console.log(
    '(penetraciones de respuesta múltiple: un hogar compra en varios canales, por eso\n' +
      ' la suma pasa de 100. El cociente es canales por hogar, nunca cuota de mercado)\n',
  );
  console.log('canasta       lugar        período  formas   suma  canales/hogar  informal');
  console.log('-'.repeat(80));
  for (const row of rows) {
    // A group with several readings of one channel has no mix to compute, and
    // the view returns null rather than a sum that would read as one.
    const sum = row.penetration_sum ?? '—';
    const perHousehold = row.channels_per_household ?? '—';
    const informal = row.informal_share_of_visits ? `${row.informal_share_of_visits} %` : '—';
    console.log(
      `${row.goods_class.padEnd(13)} ${row.territory.padEnd(12)} ${row.reference_period.padEnd(7)} ` +
        `${row.forms_read.padStart(6)}  ${sum.padStart(5)}  ${perHousehold.padStart(13)}  ` +
        `${informal.padStart(8)}` +
        (row.one_reading_per_form ? '' : `   (${row.readings} lecturas de una sola forma)`),
    );
  }
}

function settlementPanel(rows: readonly SettlementRow[]): void {
  console.log('\n\nCÓMO SE PAGA');
  console.log('(el tramo que decide si una venta dejó registro en alguna parte)\n');
  let current = '';
  for (const row of rows) {
    if (row.settlement_means !== current) {
      current = row.settlement_means;
      const held = Number(row.readings);
      console.log(`\n  ${current} (${held} ${held === 1 ? 'lectura' : 'lecturas'})`);
    }
    console.log(
      `    ${row.reference_period.padEnd(7)} ${row.value.padStart(14)} ${row.unit.padEnd(10)} ${row.label}`,
    );
  }
}

function gapPanel(rows: readonly GapRow[]): void {
  console.log('\n\nDISTANCIA CONTRA LA SERIE MEDIDA');
  console.log(
    '(dos mediciones distintas de una misma economía; la distancia no es el error\n' +
      ' de ninguna de las dos)\n',
  );
  if (rows.length === 0) {
    console.log('  Ninguna lectura tiene todavía serie medida para su año.');
    return;
  }
  for (const row of rows) {
    const measured = row.measured_value ?? 'sin serie cargada';
    const distance = row.distance_points ? `${row.distance_points} puntos` : '—';
    console.log(
      `  ${row.reference_period}  ${row.label}\n` +
        `      social ${row.social_value} | ${row.indicator_code} ${measured}` +
        `${row.measured_publisher ? ` (${row.measured_publisher})` : ''} | distancia ${distance}`,
    );
  }
}

async function main(): Promise<void> {
  const database = createReaderDatabase(getEnvironment());
  try {
    const [coverage] = await database.query(COVERAGE);
    const [mix] = await database.query(MIX);
    const [settlement] = await database.query(SETTLEMENT);
    const [gap] = await database.query(GAP);

    coveragePanel(coverage as unknown as CoverageRow[]);
    mixPanel(mix as unknown as MixRow[]);
    settlementPanel(settlement as unknown as SettlementRow[]);
    gapPanel(gap as unknown as GapRow[]);

    const unread = (coverage as unknown as CoverageRow[]).filter((row) => row.unread);
    console.log(
      `\n\nFormas sin ninguna lectura: ${unread.length}` +
        (unread.length > 0 ? ` (${unread.map((row) => row.business_form).join(', ')})` : ''),
    );
  } finally {
    await database.close();
  }
}

main().catch((error: unknown) => {
  process.stderr.write(`${error instanceof Error ? error.message : 'Trade report failed'}\n`);
  process.exitCode = 1;
});
