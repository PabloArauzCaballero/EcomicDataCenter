import 'dotenv/config';
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
 * Everything runs on ONE pinned connection, and that is not a detail. Two of
 * the guards below are session settings — an advisory lock and the interval at
 * which the server checks whether its client is still there — and a pool would
 * scatter them across connections and apply each to a different query than the
 * one it was meant to protect.
 *
 * What happened on 2026-09-09 is why the guards exist. A first run was cut with
 * Ctrl+C; the client died and the REFRESH kept running on the server for over
 * an hour, because a backend busy building a snapshot has no reason to touch
 * its socket and never notices the client is gone. A second run then sat
 * thirty-nine minutes waiting on the first one's lock, printing nothing. The
 * lock below makes the second run say so and leave; the connection check makes
 * the first one die within seconds of its client.
 */

/** The stored copies, rebuilt in the order their cost suggests: cheapest first. */
const SNAPSHOTS = [
  'world_panel_catalogue_snapshot',
  'company_filing_snapshot',
  'indicator_source_note_snapshot',
  'macro_indicator_annual_snapshot',
] as const;

/** One key for every process that rebuilds these copies, whatever machine it runs on. */
const LOCK_SQL = `SELECT pg_try_advisory_lock(
  hashtextextended('observatorio-economico:refresh-read-model-snapshots', 0)
) AS held`;

/** The narrowest view of a pinned `pg` client this file needs. */
interface Session {
  query<T>(sql: string, values?: unknown[]): Promise<{ rows: T[] }>;
}

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
async function isBuilt(session: Session, snapshot: string): Promise<boolean> {
  const { rows } = await session.query<{ built: boolean }>(
    `SELECT c.relispopulated AS built
       FROM pg_catalog.pg_class c
       JOIN pg_catalog.pg_namespace n ON n.oid = c.relnamespace
      WHERE n.nspname = 'read_models' AND c.relname = $1`,
    [snapshot],
  );
  const row = rows[0];
  if (row === undefined) throw new Error(`read_models.${snapshot} no existe; falta la migracion 0072`);
  return row.built;
}

async function refresh(session: Session, snapshot: string): Promise<void> {
  const concurrent = (await isBuilt(session, snapshot)) ? 'CONCURRENTLY ' : '';
  const how = concurrent === '' ? 'primera construccion' : 'concurrente';
  // Se anuncia ANTES de empezar: la reconstruccion son minutos de silencio, y
  // un operador que no ve nada no distingue «trabajando» de «colgado».
  process.stdout.write(`  ${snapshot.padEnd(34)} reconstruyendo (${how})...\n`);
  const started = Date.now();
  await session.query(`REFRESH MATERIALIZED VIEW ${concurrent}read_models.${snapshot}`);
  const { rows } = await session.query<{ filas: string }>(
    `SELECT count(*)::text AS filas FROM read_models.${snapshot}`,
  );
  const filas = rows[0]?.filas ?? '0';
  const seconds = Math.round((Date.now() - started) / 1000);
  process.stdout.write(`  ${snapshot.padEnd(34)} ${filas.padStart(9)} filas  ${seconds}s\n`);
}

/**
 * Settings that only make sense on the one session doing the work.
 *
 * No statement ceiling: rebuilding the whole corpus is minutes by design, and
 * the ceiling that protects an ordinary query would abort exactly this. What
 * bounds a runaway instead is the connection check — a backend whose client has
 * gone is not a rebuild anybody is waiting for, and ten seconds is how long it
 * may outlive that client. It exists since PostgreSQL 14; on anything older the
 * refresh still runs, only without that net, and the note says so.
 */
async function prepare(session: Session): Promise<void> {
  await session.query('SET statement_timeout = 0');
  try {
    await session.query(`SET client_connection_check_interval = '10s'`);
  } catch {
    process.stdout.write(
      '  (este PostgreSQL no admite client_connection_check_interval: un cliente ' +
        'que muera dejara la reconstruccion corriendo hasta que termine)\n',
    );
  }
}

async function main(): Promise<void> {
  const database = createWriterDatabase(getEnvironment());
  const failed: string[] = [];
  let session: unknown;
  try {
    await database.authenticate();
    session = await database.connectionManager.getConnection({ type: 'write' });
    const pinned = session as Session;

    const { rows } = await pinned.query<{ held: boolean }>(LOCK_SQL);
    if (rows[0]?.held !== true) {
      process.stderr.write(
        'ya hay una reconstruccion en curso sobre esta base; esta se retira sin tocar nada.\n' +
          'Si la anterior murio con su cliente, PostgreSQL la cancela sola en unos segundos.\n',
      );
      process.exitCode = 2;
      return;
    }

    await prepare(pinned);
    process.stdout.write('reconstruyendo las copias guardadas\n');
    /*
     * Cada copia se informa por separado y un fallo no cancela las siguientes.
     * Son cuatro modelos independientes: que el panel mundial se quede sin sitio
     * para ordenar no es razon para dejar sin reconstruir el registro de fuentes,
     * y saber cuales entraron es justo lo que hace falta para decidir que hacer
     * con las que no.
     */
    for (const snapshot of SNAPSHOTS) {
      try {
        await refresh(pinned, snapshot);
      } catch (error) {
        failed.push(snapshot);
        const detail = error instanceof Error ? error.message : 'fallo no clasificado';
        process.stderr.write(`  ${snapshot.padEnd(34)} FALLO: ${detail}\n`);
      }
    }
  } finally {
    // Cerrar la sesion suelta el candado; no hace falta desbloquear a mano.
    if (session !== undefined && session !== null) {
      database.connectionManager.releaseConnection(session);
    }
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
