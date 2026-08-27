import 'dotenv/config';
import pg from 'pg';

const client = new pg.Client({
  connectionString: process.env.DATABASE_READER_URL ?? process.env.DATABASE_WRITER_URL,
});
await client.connect();
const ask = async (label, sql) => {
  try {
    const { rows } = await client.query(sql);
    console.log(`${label}: ${rows.map((r) => Object.values(r).join(' | ')).join('  ·  ')}`);
  } catch (error) {
    console.log(`${label}: ${error.message.slice(0, 90)}`);
  }
};
await ask('migraciones', "select count(*)::text, max(name) from infrastructure.migration_history");
await ask('vistas prensa', "select count(*)::text from information_schema.views where table_schema='read_models' and table_name like 'press%'");
await ask('notas', "select count(*)::text from read_models.press_article where status='PUBLISHED' and not superseded");
await ask('ultima nota', "select coalesce(max(event_date)::text,'-') from read_models.press_article");
await ask('con acento', "select count(*)::text from read_models.press_article where headline ~ '[aeiouAEIOU]'");
await ask('otros pct', "select round(100.0*count(*) filter (where topic='OTROS')/greatest(count(*),1),1)::text from read_models.press_article where status='PUBLISHED' and not superseded");
await ask('hechos bbv', "select count(*)::text from read_models.company_filing");
await ask('series diarias', "select count(*)::text from read_models.economic_indicator_daily");
await ask('macro anual', "select count(*)::text from read_models.macro_indicator_annual");
await client.end();
