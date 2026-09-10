import type { Sequelize } from 'sequelize';

/**
 * Rebuilds the stored copies of the read models that no longer answer in time.
 *
 * Migration 0072 creates them `WITH NO DATA` on purpose, so a deploy is never
 * held behind minutes of sorting. This is the other half, shared by the two
 * places that run it: the CLI an operator calls by hand, and the API itself
 * right after it starts listening. The second exists because of what happened
 * on 2026-09-09: the copies stayed empty for hours after the migration landed,
 * a hand-run rebuild was killed halfway when the collector's scheduled deploy
 * replaced the container it ran in, and every visit to the report paid the full
 * price meanwhile.
 *
 * Everything runs on ONE pinned connection, and that is not a detail. Two of
 * the guards are session settings — an advisory lock and the interval at which
 * the server checks whether its client is still there — and a pool would
 * scatter them across connections and apply each to a different query than the
 * one it was meant to protect.
 */

/** The narrowest view of a pinned `pg` client this module needs. */
export interface RefreshSession {
  query<T>(sql: string, values?: unknown[]): Promise<{ rows: T[] }>;
}

/** Where progress goes: a terminal for the CLI, the process log for the API. */
export interface RefreshReport {
  line(text: string): void;
  problem(text: string): void;
}

export interface RefreshOutcome {
  built: string[];
  failed: string[];
}

/** The stored copies, in the order their cost suggests: cheapest first. */
const ORDER = [
  'world_panel_catalogue_snapshot',
  'company_filing_snapshot',
  'indicator_source_note_snapshot',
  'macro_indicator_annual_snapshot',
] as const;

/** One key for every process that rebuilds these copies, whatever machine it runs on. */
const LOCK_SQL = `SELECT pg_try_advisory_lock(
  hashtextextended('observatorio-economico:refresh-read-model-snapshots', 0)
) AS held`;

/**
 * Runs `work` on a single connection taken out of the pool and given back after.
 *
 * Releasing the connection ends the session, and with it the advisory lock:
 * there is nothing to unlock by hand, and nothing left locked if `work` throws.
 */
export async function withPinnedSession<T>(
  database: Sequelize,
  work: (session: RefreshSession) => Promise<T>,
): Promise<T> {
  const connection = await database.connectionManager.getConnection({ type: 'write' });
  try {
    return await work(connection as RefreshSession);
  } finally {
    if (connection !== null) database.connectionManager.releaseConnection(connection);
  }
}

/**
 * Settings that only make sense on the one session doing the work.
 *
 * No statement ceiling: rebuilding the whole corpus is minutes by design, and
 * the ceiling that protects an ordinary query would abort exactly this. What
 * bounds a runaway instead is the connection check — a backend whose client has
 * gone is not a rebuild anybody is waiting for, and ten seconds is how long it
 * may outlive that client. It exists since PostgreSQL 14; on anything older the
 * rebuild still runs, only without that net, and the report says so.
 */
async function prepare(session: RefreshSession, report: RefreshReport): Promise<void> {
  await session.query('SET statement_timeout = 0');
  try {
    await session.query(`SET client_connection_check_interval = '10s'`);
  } catch {
    report.line(
      'este PostgreSQL no admite client_connection_check_interval: un cliente que ' +
        'muera dejara la reconstruccion corriendo hasta que termine',
    );
  }
}

/**
 * The copies and whether each has ever been built, in rebuild order.
 *
 * `pg_class.relispopulated` is the server's own answer, and the only reliable
 * one: a copy created `WITH NO DATA` raises on any read, while a built copy
 * that happens to be empty returns no rows, and counting cannot tell «nobody
 * has filled this» from «there is nothing in it». Read from the catalog rather
 * than from `read_models.snapshot_state` so the rebuild does not depend on a
 * grant the writer role may not have been given.
 */
async function listSnapshots(
  session: RefreshSession,
): Promise<Array<{ name: string; built: boolean }>> {
  const { rows } = await session.query<{ name: string; built: boolean }>(
    `SELECT c.relname AS name, c.relispopulated AS built
       FROM pg_catalog.pg_class c
       JOIN pg_catalog.pg_namespace n ON n.oid = c.relnamespace
      WHERE n.nspname = 'read_models' AND c.relkind = 'm' AND c.relname = ANY($1)`,
    [[...ORDER]],
  );
  const rank = new Map<string, number>(ORDER.map((name, index) => [name, index]));
  return rows.sort((a, b) => (rank.get(a.name) ?? 99) - (rank.get(b.name) ?? 99));
}

/**
 * Rebuilds one copy the only way its state allows.
 *
 * A copy that has never been populated cannot be refreshed CONCURRENTLY —
 * there is no old content to compare against. Once it holds rows, CONCURRENTLY
 * is the only acceptable form: a plain refresh takes an exclusive lock, and the
 * report stops answering for as long as the rebuild lasts.
 */
async function refreshOne(
  session: RefreshSession,
  snapshot: { name: string; built: boolean },
  report: RefreshReport,
): Promise<void> {
  const how = snapshot.built ? 'concurrente' : 'primera construccion';
  // Announced BEFORE it starts: the rebuild is minutes of silence, and whoever
  // is watching cannot tell «working» from «stuck» without this line.
  report.line(`${snapshot.name.padEnd(34)} reconstruyendo (${how})...`);
  const started = Date.now();
  const concurrently = snapshot.built ? 'CONCURRENTLY ' : '';
  await session.query(`REFRESH MATERIALIZED VIEW ${concurrently}read_models.${snapshot.name}`);
  const { rows } = await session.query<{ filas: string }>(
    `SELECT count(*)::text AS filas FROM read_models.${snapshot.name}`,
  );
  const filas = rows[0]?.filas ?? '0';
  const seconds = Math.round((Date.now() - started) / 1000);
  report.line(`${snapshot.name.padEnd(34)} ${filas.padStart(9)} filas  ${seconds}s`);
}

/**
 * Rebuilds the stored copies, or says why it will not.
 *
 * `null` means another rebuild holds the lock. It is not a failure: the other
 * one is doing the work, and this one leaving quietly is the whole point of
 * the lock — on 2026-09-09 a second rebuild sat thirty-nine minutes on a
 * relation lock instead, printing nothing.
 *
 * With `onlyUnbuilt`, copies that already hold rows are left alone. That is
 * what the API does at boot: fill what a migration left empty, and nothing
 * else, because the process that starts three times a day behind the
 * collector's deploy must not also rebuild the whole register three times a
 * day. The CLI passes `false` and rebuilds everything, which is an operator's
 * decision to take.
 *
 * Each copy is reported on its own and a failure does not cancel the rest.
 * They are independent models: the panel catalogue running out of sort space
 * is no reason to leave the source register unbuilt, and knowing which ones
 * landed is exactly what deciding about the others needs.
 */
export async function refreshSnapshots(
  session: RefreshSession,
  report: RefreshReport,
  options: { onlyUnbuilt: boolean },
): Promise<RefreshOutcome | null> {
  const { rows } = await session.query<{ held: boolean }>(LOCK_SQL);
  if (rows[0]?.held !== true) return null;

  await prepare(session, report);
  const snapshots = (await listSnapshots(session)).filter(
    (snapshot) => !options.onlyUnbuilt || !snapshot.built,
  );
  const outcome: RefreshOutcome = { built: [], failed: [] };
  for (const snapshot of snapshots) {
    try {
      await refreshOne(session, snapshot, report);
      outcome.built.push(snapshot.name);
    } catch (error) {
      outcome.failed.push(snapshot.name);
      const detail = error instanceof Error ? error.message : 'fallo no clasificado';
      report.problem(`${snapshot.name.padEnd(34)} FALLO: ${detail}`);
    }
  }
  return outcome;
}
