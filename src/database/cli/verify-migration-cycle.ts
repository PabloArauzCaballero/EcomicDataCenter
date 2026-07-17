import 'dotenv/config';
import { getEnvironment } from '../../config/environment';
import { createMigrationRunner, withMigrationLock } from '../migration.runner';

const BASELINE_PREFIX = '0009-';
const LATEST_PREFIX = '0016-';

/** Verifies empty install, incremental upgrade, latest rollback and reapplication. */
async function main(): Promise<void> {
  const environment = getEnvironment();
  if (environment.NODE_ENV === 'production') {
    throw new Error('Migration cycle verification is forbidden in production');
  }

  const { database, migrator } = await createMigrationRunner(environment);
  try {
    await withMigrationLock(database, async () => {
      const alreadyExecuted = await migrator.executed();
      if (alreadyExecuted.length > 0) {
        throw new Error('Migration cycle verification requires an empty migration history');
      }

      const pending = await migrator.pending();
      const baseline = pending.find((migration) => migration.name.startsWith(BASELINE_PREFIX));
      if (!baseline) throw new Error('Baseline migration 0009 was not found');

      await migrator.up({ to: baseline.name });
      await migrator.up();

      const rolledBack = await migrator.down();
      if (rolledBack.length !== 1 || !rolledBack[0]?.name.startsWith(LATEST_PREFIX)) {
        throw new Error('Expected migration 0016 to be rolled back');
      }

      await migrator.up();
      const remaining = await migrator.pending();
      if (remaining.length > 0) throw new Error('Migration cycle left pending migrations');
    });
    process.stdout.write('PASS: migration cycle 0001->0009->0016->0015->0016 verified.\n');
  } finally {
    await database.close();
  }
}

main().catch((error: unknown) => {
  process.stderr.write(`${error instanceof Error ? error.message : 'Migration cycle failed'}\n`);
  process.exitCode = 1;
});
