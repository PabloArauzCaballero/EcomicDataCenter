import 'dotenv/config';
import { getEnvironment } from '../../src/config/environment';
import { createWriterDatabase } from '../../src/database/database.factory';

/**
 * Rebuilds the materialised copy of the press read models.
 *
 * Run after anything that adds coverage — a collection, a seed load — because
 * until it runs the report serves the corpus as it stood before. Concurrently,
 * so a reader mid-query is never locked out; that is what the unique index on
 * the claim id is for.
 *
 * Run with `yarn press:refresh`.
 */
async function main(): Promise<void> {
  const database = createWriterDatabase(getEnvironment());
  try {
    await database.authenticate();
    /*
     * Rebuilding the snapshot reads the whole corpus through the view it copies
     * — minutes of work by design, and the only operation in the system that is
     * meant to take them. The session ceiling that protects ordinary queries is
     * lifted for this one and nothing else.
     */
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
    console.log(
      `instantánea al día: ${held} notas en ${Math.round((Date.now() - started) / 1000)} s`,
    );
  } finally {
    await database.close();
  }
}

main().catch((error: unknown) => {
  process.stderr.write(`${error instanceof Error ? error.message : 'Snapshot refresh failed'}\n`);
  process.exitCode = 1;
});
