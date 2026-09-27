import 'dotenv/config';
import type { Sequelize } from 'sequelize';
import { getEnvironment } from '../../config/environment';
import { createWriterDatabase } from '../database.factory';

/**
 * Rebuilds the stored copy of the press read models, from inside the image.
 *
 * `scripts/press/refresh-press-snapshot.ts` does the same thing and is the one
 * to run on a workstation; it is a script, so it never reaches `dist` and the
 * deployed container cannot call it. A migration that changes how coverage is
 * filed only changes the *view*: until the snapshot over it is rebuilt, every
 * report still serves the corpus as it stood before, which is indistinguishable
 * from the migration never having run. This entry point is what a workflow
 * invokes for that second half.
 *
 * Concurrently, so a reader mid-query is never locked out — that is what the
 * unique index on the claim id is for — and with no statement ceiling, because
 * rebuilding the whole corpus is minutes of work by design and the ceiling that
 * protects ordinary queries would abort it.
 */
/**
 * Prints how the refreshed snapshot files the corpus along one dimension.
 *
 * The count is the evidence a widening of the lexicon actually landed: a
 * migration that replaced the view but never reached the stored copy leaves
 * these shares exactly where they were, and no other reading from outside the
 * server can tell the two cases apart.
 */
async function report(database: Sequelize, column: 'topic' | 'tone', title: string): Promise<void> {
  const [rows] = await database.query(
    `SELECT ${column} AS clave, count(*)::text AS notas,
            to_char(100.0 * count(*) / sum(count(*)) OVER (), 'FM990.00') AS parte
     FROM read_models.press_article_snapshot
     GROUP BY ${column}
     ORDER BY count(*) DESC`,
  );
  process.stdout.write(`\n${title}\n`);
  for (const row of rows as Array<{ clave: string; notas: string; parte: string }>) {
    process.stdout.write(`  ${row.clave.padEnd(20)} ${row.notas.padStart(7)}  ${row.parte}%\n`);
  }
}

async function main(): Promise<void> {
  const database = createWriterDatabase(getEnvironment());
  try {
    await database.authenticate();
    await database.query('SET statement_timeout = 0');
    const started = Date.now();
    await database.query(
      'REFRESH MATERIALIZED VIEW CONCURRENTLY read_models.press_article_snapshot',
    );
    await database.query(
      'REFRESH MATERIALIZED VIEW CONCURRENTLY read_models.press_term_mention_snapshot',
    );
    const [rows] = await database.query(
      'SELECT count(*)::text AS notas FROM read_models.press_article_snapshot',
    );
    const held = (rows as Array<{ notas: string }>)[0]?.notas ?? '0';
    process.stdout.write(
      `instantanea al dia: ${held} notas en ${Math.round((Date.now() - started) / 1000)} s\n`,
    );
    await report(database, 'topic', 'temas');
    await report(database, 'tone', 'tonos');
  } finally {
    await database.close();
  }
}

main().catch((error: unknown) => {
  process.stderr.write(`${error instanceof Error ? error.message : 'Snapshot refresh failed'}\n`);
  process.exitCode = 1;
});
