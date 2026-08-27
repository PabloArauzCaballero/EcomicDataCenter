import 'dotenv/config';

/**
 * The two steps that finish a production load, once its transaction commits.
 *
 * The lexicon migration written while the load was running has to reach the
 * remote too, and the snapshot the report reads is empty until it is built. Run
 * as one command so neither is forgotten: a report reading an unbuilt snapshot
 * shows an empty archive, which looks exactly like a failed load.
 */
for (const key of ['DATABASE_WRITER_URL', 'DATABASE_MIGRATOR_URL', 'DATABASE_READER_URL']) {
  const url = process.env[key];
  if (url?.includes('-pooler')) process.env[key] = url.replace('-pooler', '');
}

const { spawnSync } = await import('node:child_process');
const migrated = spawnSync('npx', ['tsx', 'src/database/cli/migrate.ts'], {
  stdio: 'inherit',
  shell: true,
  env: process.env,
});
if (migrated.status !== 0) throw new Error('las migraciones no se aplicaron');
console.log('migraciones al día');

const { getEnvironment } = await import('../src/config/environment.ts');
const { createWriterDatabase } = await import('../src/database/database.factory.ts');
const database = createWriterDatabase(getEnvironment());
try {
  await database.query('SET statement_timeout = 0');
  const started = Date.now();
  await database.query('REFRESH MATERIALIZED VIEW read_models.press_article_snapshot');
  await database.query('REFRESH MATERIALIZED VIEW read_models.press_term_mention_snapshot');
  const [rows] = await database.query(
    `SELECT count(*)::text AS notas,
            count(DISTINCT outlet)::text AS medios,
            min(event_date)::text AS desde,
            max(event_date)::text AS hasta
     FROM read_models.press_article_snapshot WHERE status = 'PUBLISHED' AND NOT superseded`,
  );
  const held = rows[0];
  console.log(
    `instantánea: ${held.notas} notas de ${held.medios} medios, ${held.desde} → ${held.hasta}, ` +
      `en ${Math.round((Date.now() - started) / 1000)} s`,
  );
} finally {
  await database.close();
}
