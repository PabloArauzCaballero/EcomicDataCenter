import 'dotenv/config';
import pg from 'pg';

/** What each endpoint the environment names actually holds. */
const targets = [
  ['WRITER  (shy-star)', process.env.DATABASE_WRITER_URL],
  ['MIGRATOR (damp-unit)', process.env.DATABASE_MIGRATOR_URL],
];
for (const [label, raw] of targets) {
  const client = new pg.Client({ connectionString: (raw ?? '').replace('-pooler', '') });
  try {
    await client.connect();
    const one = async (sql, fallback = '-') => {
      try { const { rows } = await client.query(sql); return Object.values(rows[0] ?? {})[0] ?? fallback; }
      catch { return fallback; }
    };
    console.log(`\n${label}`);
    console.log('  migraciones     ', await one('select count(*)::text from infrastructure.migration_history'));
    console.log('  última migración', await one("select max(name) from infrastructure.migration_history"));
    console.log('  observaciones   ', await one('select count(*)::text from intelligence.raw_observation'));
    console.log('  claims          ', await one('select count(*)::text from intelligence.fact_claim'));
    console.log('  vistas read_models', await one("select count(*)::text from information_schema.views where table_schema='read_models'"));
    console.log('  matviews        ', await one("select count(*)::text from pg_matviews where schemaname='read_models'"));
    console.log('  tamaño          ', await one('select pg_size_pretty(pg_database_size(current_database()))'));
  } catch (e) {
    console.log(`\n${label}\n  no responde: ${e.message.slice(0, 70)}`);
  } finally { await client.end().catch(() => {}); }
}
