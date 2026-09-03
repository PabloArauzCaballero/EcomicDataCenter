import 'dotenv/config';
import { getEnvironment } from '../../src/config/environment';
import { createWriterDatabase } from '../../src/database/database.factory';

/**
 * Rebuilds the materialised copy of the commerce reading register.
 *
 * The view and the snapshot keep their `social_` names after ADR 0025 retired
 * the platform analytics they once also carried; the dashboard reads them by
 * that name from another repository, so renaming is a coordinated change that
 * has not happened yet.
 *
 * Run after anything that registers a reading — a seed load, a new publication
 * added to the catalogue — because until it runs the report serves the register
 * as it stood before.
 *
 * The summary it prints is the one worth seeing: how many readings are held,
 * and how many of them carry a low evidence grade. A register whose low band
 * grows faster than its high band is drifting toward a rumour list, and that
 * should be visible on every refresh rather than discovered later.
 *
 * Run with `yarn social:refresh`.
 */

interface RegisterSummary {
  readonly held: string;
  readonly high: string;
  readonly low: string;
}

async function main(): Promise<void> {
  const database = createWriterDatabase(getEnvironment());
  try {
    await database.authenticate();
    await database.query('SET statement_timeout = 0');
    const started = Date.now();
    await database.query(
      'REFRESH MATERIALIZED VIEW CONCURRENTLY read_models.social_reading_snapshot',
    );
    const [rows] = await database.query(`
      SELECT
        count(*)::text                                                  AS held,
        count(*) FILTER (WHERE evidence_grade = 'HIGH')::text            AS high,
        count(*) FILTER (WHERE evidence_grade = 'LOW')::text             AS low
      FROM read_models.social_reading_snapshot
    `);
    const summary = (rows as RegisterSummary[])[0];
    const seconds = Math.round((Date.now() - started) / 1000);
    console.log(
      `registro al día: ${summary?.held ?? '0'} lecturas ` +
        `(${summary?.high ?? '0'} de evidencia alta, ${summary?.low ?? '0'} de evidencia baja) ` +
        `en ${seconds} s`,
    );
  } finally {
    await database.close();
  }
}

main().catch((error: unknown) => {
  process.stderr.write(`${error instanceof Error ? error.message : 'Snapshot refresh failed'}\n`);
  process.exitCode = 1;
});
