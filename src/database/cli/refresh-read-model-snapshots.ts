import 'dotenv/config';
import type { Sequelize } from 'sequelize';
import { getEnvironment } from '../../config/environment';
import { createWriterDatabase } from '../database.factory';

/**
 * Fills the stored copies migration 0072 created empty, from inside the image.
 *
 * The four models it snapshots — the source register, the annual macro series,
 * the filings and the world panel catalogue — all rebuild their figures from
 * every claim's evidence, and against the corpus as it now stands none of them
 * finishes inside the ceiling an ordinary query gets. The migration creates
 * them `WITH NO DATA` on purpose, so a deploy is never held behind minutes of
 * sorting; this is the other half, and it is meant to be run on its own, where
 * failing costs a stale section rather than an API that cannot start.
 *
 * Idempotent, and safe to run more often than needed: rebuilding a snapshot
 * costs only the time it takes.
 */

/** The stored copies, rebuilt in the order their cost suggests: cheapest first. */
const SNAPSHOTS = [
  'world_panel_catalogue_snapshot',
  'company_filing_snapshot',
  'indicator_source_note_snapshot',
  'macro_indicator_annual_snapshot',
] as const;

/**
 * Whether the copy has ever been built.
 *
 * It decides how to refresh, and the two ways are not interchangeable. A view
 * created `WITH NO DATA` has never been populated, and PostgreSQL refuses to
 * refresh one CONCURRENTLY — there is no old content to compare against. Once
 * it holds rows, CONCURRENTLY is the only acceptable form: a plain refresh
 * takes an exclusive lock, and the report stops answering for as long as the
 * rebuild lasts.
 */
async function isBuilt(database: Sequelize, snapshot: string): Promise<boolean> {
  const [rows] = await database.query(
    `SELECT c.relispopulated AS built
       FROM pg_catalog.pg_class c
       JOIN pg_catalog.pg_namespace n ON n.oid = c.relnamespace
      WHERE n.nspname = 'read_models' AND c.relname = $1`,
    { bind: [snapshot] },
  );
  const row = (rows as Array<{ built: boolean }>)[0];
  if (row === undefined) throw new Error(`read_models.${snapshot} no existe; falta la migracion 0072`);
  return row.built;
}

async function refresh(database: Sequelize, snapshot: string): Promise<void> {
  const concurrent = (await isBuilt(database, snapshot)) ? 'CONCURRENTLY ' : '';
  const started = Date.now();
  await database.query(`REFRESH MATERIALIZED VIEW ${concurrent}read_models.${snapshot}`);
  const [rows] = await database.query(`SELECT count(*)::text AS filas FROM read_models.${snapshot}`);
  const filas = (rows as Array<{ filas: string }>)[0]?.filas ?? '0';
  const seconds = Math.round((Date.now() - started) / 1000);
  const how = concurrent === '' ? 'primera construccion' : 'concurrente';
  process.stdout.write(`  ${snapshot.padEnd(34)} ${filas.padStart(9)} filas  ${seconds}s  (${how})\n`);
}

async function main(): Promise<void> {
  const database = createWriterDatabase(getEnvironment());
  /*
   * Cada copia se informa por separado y un fallo no cancela las siguientes.
   * Son cuatro modelos independientes: que el panel mundial se quede sin sitio
   * para ordenar no es razon para dejar sin reconstruir el registro de fuentes,
   * y saber cuales entraron es justo lo que hace falta para decidir que hacer
   * con las que no.
   */
  const failed: string[] = [];
  try {
    await database.authenticate();
    // Reconstruir el corpus entero son minutos por diseño, y el techo que
    // protege una consulta ordinaria abortaria justamente esto.
    await database.query('SET statement_timeout = 0');
    process.stdout.write('reconstruyendo las copias guardadas\n');
    for (const snapshot of SNAPSHOTS) {
      try {
        await refresh(database, snapshot);
      } catch (error) {
        failed.push(snapshot);
        const detail = error instanceof Error ? error.message : 'fallo no clasificado';
        process.stderr.write(`  ${snapshot.padEnd(34)} FALLO: ${detail}\n`);
      }
    }
  } finally {
    await database.close();
  }

  if (failed.length > 0) {
    process.stderr.write(`\nno se pudieron reconstruir: ${failed.join(', ')}\n`);
    process.exitCode = 1;
  }
}

main().catch((error: unknown) => {
  process.stderr.write(`${error instanceof Error ? error.message : 'Snapshot refresh failed'}\n`);
  process.exitCode = 1;
});
