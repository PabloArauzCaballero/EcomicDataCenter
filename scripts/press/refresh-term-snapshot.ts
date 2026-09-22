import 'dotenv/config';
import { getEnvironment } from '../../src/config/environment';
import { createWriterDatabase } from '../../src/database/database.factory';

/**
 * Rebuilds only the copy of the archive read by watched subject.
 *
 * `press:refresh` rebuilds three snapshots, and the article one is by far the
 * most expensive: it reassembles thirty-eight thousand notes from their
 * evidence. When what changed is the watchlist and not the corpus — a subject
 * added, a pattern corrected — that work is repeated for nothing, and against a
 * remote database it is the difference between ten minutes and one.
 *
 * The subject snapshot reads the article snapshot, so this is only correct when
 * the corpus itself has not moved. After a load that brought new notes in, run
 * `yarn press:refresh` instead.
 *
 * Run with `yarn press:refresh:terms`.
 */

interface Summary {
  readonly mentions: string;
  readonly terms: string;
  readonly families: string;
  readonly months: string;
}

async function main(): Promise<void> {
  const database = createWriterDatabase(getEnvironment());
  try {
    await database.authenticate();
    await database.query('SET statement_timeout = 0');
    const started = Date.now();
    await database.query(
      'REFRESH MATERIALIZED VIEW CONCURRENTLY read_models.press_term_mention_snapshot',
    );
    const [rows] = await database.query(`
      SELECT
        (SELECT count(*)::text FROM read_models.press_term_mention_snapshot)          AS mentions,
        (SELECT count(DISTINCT term)::text FROM read_models.press_term_mention_snapshot) AS terms,
        (SELECT count(DISTINCT family)::text FROM read_models.press_term_mention_snapshot) AS families,
        (SELECT count(*)::text FROM read_models.press_term_month)                     AS months
    `);
    const summary = (rows as Summary[])[0];
    console.log(
      `temas al día: ${summary?.mentions ?? '0'} menciones · ` +
        `${summary?.terms ?? '0'} temas en ${summary?.families ?? '0'} familias · ` +
        `${summary?.months ?? '0'} filas mensuales en ${Math.round((Date.now() - started) / 1000)} s`,
    );
  } finally {
    await database.close();
  }
}

main().catch((error: unknown) => {
  process.stderr.write(`${error instanceof Error ? error.message : 'Term refresh failed'}\n`);
  process.exitCode = 1;
});
