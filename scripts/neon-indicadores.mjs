import 'dotenv/config';
import pg from 'pg';

/**
 * Reports what the live branch holds for the indicator work.
 *
 * Read-only on purpose: it answers "did the migration land and is the data
 * there" without changing anything, so it is safe to run against production
 * while deciding whether a load is needed.
 *
 * Targets the **writer** branch, because that is where the corpus lives; the
 * reader and migrator entries in `.env` point at a different, empty branch.
 */

const target = process.env.DATABASE_WRITER_URL;
const mine = ['0055-separate-financial-system-and-add-ufv', '0057-create-sovereign-yield-curve'];

const client = new pg.Client({
  connectionString: target,
  statement_timeout: 120_000,
  connectionTimeoutMillis: 30_000,
});
await client.connect();
console.log('destino:', new URL(target).hostname);

const ask = async (label, sql, values) => {
  try {
    const { rows } = await client.query(sql, values);
    console.log(`${label}: ${rows.map((r) => Object.values(r).join('=')).join('  ') || '(vacio)'}`);
  } catch (error) {
    console.log(`${label}: ${error.message.slice(0, 80)}`);
  }
};

await ask(
  'mis migraciones',
  'select name from infrastructure.migration_history where name = any($1::text[])',
  [mine],
);
await ask(
  'vistas',
  "select table_name from information_schema.views where table_schema='read_models' order by 1",
);
await ask(
  'sectores',
  'select sector, count(*)::text from read_models.macro_indicator_annual group by sector order by sector',
);
await ask('curva soberana', 'select count(*)::text from read_models.sovereign_yield_curve');
await ask(
  'UFV diaria',
  "select count(*)::text from read_models.economic_indicator_reading where indicator_code='UFV_BOB'",
);

await client.end();
