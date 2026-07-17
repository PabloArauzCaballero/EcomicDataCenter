import 'dotenv/config';
import { getEnvironment } from '../../config/environment';
import { createMigrationRunner, withMigrationLock } from '../migration.runner';

async function main(): Promise<void> {
  const { database, migrator } = await createMigrationRunner(getEnvironment());
  try {
    await withMigrationLock(database, () => migrator.down());
  } finally {
    await database.close();
  }
}

main().catch((error: unknown) => {
  process.stderr.write(`${error instanceof Error ? error.message : 'Migration rollback failed'}\n`);
  process.exitCode = 1;
});
