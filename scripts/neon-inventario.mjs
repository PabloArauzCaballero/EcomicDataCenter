import 'dotenv/config';
import pg from 'pg';
const url = (process.env.DATABASE_WRITER_URL ?? '').replace('-pooler', '');
const client = new pg.Client({ connectionString: url });
await client.connect();
const ask = async (label, sql) => {
  try {
    const { rows } = await client.query(sql);
    console.log(`${label}: ${rows.map((r) => Object.values(r).join(' | ')).join(' · ')}`);
  } catch (e) {
    console.log(`${label}: ${e.message.slice(0, 80)}`);
  }
};
await ask('observaciones crudas', 'select count(*)::text from intelligence.raw_observation');
await ask('claims', 'select count(*)::text from intelligence.fact_claim');
await ask('evidencia', 'select count(*)::text from intelligence.claim_evidence');
await ask('artefactos', 'select count(*)::text from provenance.source_artifact');
await ask(
  'vista press_article',
  "select count(*)::text from read_models.press_article where status='PUBLISHED' and not superseded",
);
await ask('matviews', "select matviewname from pg_matviews where schemaname='read_models'");
await ask(
  'migracion 0053',
  "select name from infrastructure.migration_history where name like '0053%'",
);
await client.end();
