import type { Sequelize } from 'sequelize';

/**
 * A session-level advisory lock, one per database and package.
 *
 * Per package, and not one lock for «seeding», because two operators
 * reconciling two unrelated catalogues have no reason to wait for each other;
 * per database because the key is derived from `current_database()`, so a test
 * database and production never share a lock even on the same server.
 *
 * It is taken on a pinned connection because a reconciliation spans several
 * transactions — that is what makes its checkpoints durable — and a lock held
 * inside one of them would be released by the first commit.
 *
 * Order matters against the migration lock. Provisioning takes the migration
 * lock and then seeds inside it; this never takes the migration lock at all, so
 * the two cannot form a cycle. Nothing here may be changed to acquire a second
 * exclusive lock while holding this one.
 */
const ACQUIRE_SQL = `
SELECT pg_try_advisory_lock(
  hashtextextended(current_database() || ':observatorio-economico:seed:' || $1, 0)
) AS held`;

const RELEASE_SQL = `
SELECT pg_advisory_unlock(
  hashtextextended(current_database() || ':observatorio-economico:seed:' || $1, 0)
) AS released`;

/** The narrowest view of a pinned `pg` client this module needs. */
export interface LockSession {
  query<T>(sql: string, values?: unknown[]): Promise<{ rows: T[] }>;
}

export type LockOutcome<T> = { acquired: true; result: T } | { acquired: false; result: null };

/**
 * Runs `work` while holding the package lock, or reports that someone else has it.
 *
 * A refusal is not an error. Two replicas starting the same reconciliation is
 * the normal case, and the second one must be able to say «the other is doing
 * it» rather than fail in a way an operator would retry.
 */
export async function withSeedLock<T>(
  database: Sequelize,
  packageCode: string,
  work: (session: LockSession) => Promise<T>,
): Promise<LockOutcome<T>> {
  const connection = await database.connectionManager.getConnection({ type: 'write' });
  const session = connection as unknown as LockSession;
  try {
    const { rows } = await session.query<{ held: boolean }>(ACQUIRE_SQL, [packageCode]);
    if (rows[0]?.held !== true) return { acquired: false, result: null };
    try {
      return { acquired: true, result: await work(session) };
    } finally {
      await session.query(RELEASE_SQL, [packageCode]).catch(() => undefined);
    }
  } finally {
    if (connection !== null) database.connectionManager.releaseConnection(connection);
  }
}
