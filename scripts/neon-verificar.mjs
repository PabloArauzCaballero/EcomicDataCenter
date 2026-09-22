import 'dotenv/config';
import pg from 'pg';
const client = new pg.Client({
  connectionString: (process.env.DATABASE_WRITER_URL ?? '').replace('-pooler', ''),
});
await client.connect();
const ask = async (label, sql) => {
  const { rows } = await client.query(sql);
  console.log(`${label}: ${rows.map((r) => Object.values(r).join(' | ')).join('  ·  ')}`);
};
await ask(
  'notas',
  "select count(*)::text from read_models.press_article_snapshot where status='PUBLISHED' and not superseded",
);
await ask(
  'medios',
  "select count(distinct outlet)::text from read_models.press_article_snapshot where status='PUBLISHED' and not superseded",
);
await ask(
  'rango',
  "select min(event_date)::text, max(event_date)::text from read_models.press_article_snapshot where status='PUBLISHED' and not superseded",
);
await ask(
  'otros %',
  "select round(100.0*count(*) filter (where topic='OTROS')/count(*),1)::text from read_models.press_article_snapshot where status='PUBLISHED' and not superseded",
);
await ask(
  'sin marca %',
  "select round(100.0*count(*) filter (where tone='NEUTRO')/count(*),1)::text from read_models.press_article_snapshot where status='PUBLISHED' and not superseded",
);
await ask(
  'por año',
  "select string_agg(a||'='||n, '  ' order by a) from (select left(event_date::text,4) a, count(*)::text n from read_models.press_article_snapshot where status='PUBLISHED' and not superseded group by 1) x",
);
await ask('hechos BBV', 'select count(*)::text from read_models.company_filing');
await ask('series diarias', 'select count(*)::text from read_models.economic_indicator_daily');
await ask('macro anual', 'select count(*)::text from read_models.macro_indicator_annual');
await client.end();
