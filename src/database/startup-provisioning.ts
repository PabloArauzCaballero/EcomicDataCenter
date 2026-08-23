import type { Environment } from '../config/environment';
import {
  createMigrationRunner,
  reconcileLegacyMigrationHistory,
  withMigrationLock,
} from './migration.runner';
import { runBootSeeds } from './seeds/runners/run-boot-seeds';

/**
 * Brings the database to the shape this build expects before it serves traffic.
 *
 * The hosting platform starts the process and nothing else: there is no release
 * step to hang a migration command on, so a deployment that needed one had to
 * be finished by hand, and a schema change reached production only when someone
 * remembered. Doing it here makes a redeploy the whole procedure.
 *
 * Both halves are idempotent, so the normal case is that this finds nothing to
 * do and costs one advisory lock. Migrations are recorded in their own history
 * and skipped once applied; the boot catalogs reconcile by natural key and
 * rewrite nothing when the rows already match.
 *
 * The lock is a PostgreSQL advisory lock held for the whole sequence, so two
 * replicas starting together cannot migrate or seed over each other — the
 * second waits, then finds the work already done.
 *
 * A failure here is deliberately fatal. A process that could not reach the
 * schema it was built against would answer requests with errors that look like
 * data problems, and it is far better for the platform to keep the previous
 * release serving traffic.
 */
export async function provisionDatabase(environment: Environment): Promise<void> {
  const { database, migrator } = await createMigrationRunner(environment);
  try {
    await withMigrationLock(database, async () => {
      await reconcileLegacyMigrationHistory(database, migrator);
      await migrator.up();
      await runBootSeeds();
    });
  } finally {
    await database.close();
  }
}
