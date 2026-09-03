import 'dotenv/config';
import pg from 'pg';

/**
 * Qué sabe la base remota sobre el comercio, antes y después de cargarlo.
 *
 * Los modelos de comercio viven en una migración y las lecturas en un catálogo,
 * y el tablero los lee desde otro repositorio. Entre un despliegue y otro es
 * fácil creer que la pestaña está vacía por un error del informe cuando lo que
 * falta es la vista o la carga. Esto responde cuál de las dos.
 *
 * Sin `-pooler`: las consultas son cortas, pero se lee la misma rama que
 * escriben las migraciones y no una réplica de sesión agrupada.
 */

const client = new pg.Client({
  connectionString: (
    process.env.DATABASE_READER_URL ??
    process.env.DATABASE_WRITER_URL ??
    ''
  ).replace('-pooler', ''),
});
await client.connect();

const ask = async (label, sql) => {
  try {
    const { rows } = await client.query(sql);
    console.log(`${label}: ${rows.map((r) => Object.values(r).join(' | ')).join('  ·  ')}`);
  } catch (error) {
    console.log(`${label}: ${error.message.slice(0, 100)}`);
  }
};

await ask('migración', 'select max(name) from infrastructure.migration_history');
await ask(
  'vistas de comercio',
  `select count(*)::text from pg_views
    where schemaname = 'read_models'
      and viewname in ('social_commerce', 'informal_trade_coverage',
                       'informal_trade_channel_mix', 'informal_trade_gap')`,
);
await ask('lecturas sociales', 'select count(*)::text from read_models.social_reading');
await ask(
  'lecturas en el snapshot',
  'select count(*)::text from read_models.social_reading_snapshot',
);
await ask('lecturas de comercio', 'select count(*)::text from read_models.social_commerce');
await ask(
  'formas leídas',
  `select count(*) filter (where not unread)::text || ' de ' || count(*)::text
     from read_models.informal_trade_coverage`,
);
await ask(
  'canales por hogar',
  `select goods_class || ' ' || reference_period || ': ' || coalesce(channels_per_household::text, '—')
     from read_models.informal_trade_channel_mix
    where one_reading_per_form
    order by reference_period desc`,
);

await client.end();
