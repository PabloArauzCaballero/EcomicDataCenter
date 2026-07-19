import 'dotenv/config';
import { getEnvironment } from '../../config/environment';
import { createMigrationRunner, withMigrationLock } from '../migration.runner';
import { up as grantRuntime } from '../migrations/0009-runtime-grants';
import { up as hardenRuntimeGrants } from '../migrations/0014-harden-runtime-grants';
import { up as grantBackupOperator } from '../migrations/0016-grant-backup-operator';

/**
 * Re-applies every runtime GRANT migration against the live database.
 *
 * The grant migrations are guarded by `IF EXISTS (... pg_roles ...)`, so when
 * they first run before the roles are provisioned their grants are silently
 * skipped, yet they are still recorded as executed. Re-running `db:migrate`
 * will not re-execute them. This idempotent recovery step re-asserts the
 * grants directly (GRANT/REVOKE are idempotent) without touching migration
 * history, for the case where roles are provisioned after the schema.
 */
async function main(): Promise<void> {
  const { database } = await createMigrationRunner(getEnvironment());
  const context = { context: { sequelize: database } };
  try {
    await withMigrationLock(database, async () => {
      await grantRuntime(context);
      await hardenRuntimeGrants(context);
      await grantBackupOperator(context);
    });
    process.stdout.write('Runtime grants re-applied.\n');
  } finally {
    await database.close();
  }
}

main().catch((error: unknown) => {
  process.stderr.write(`${error instanceof Error ? error.message : 'Grant reapply failed'}\n`);
  process.exitCode = 1;
});
