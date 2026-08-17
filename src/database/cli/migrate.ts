import 'dotenv/config';
import { getEnvironment } from '../../config/environment';
import {
  createMigrationRunner,
  reconcileLegacyMigrationHistory,
  withMigrationLock,
} from '../migration.runner';

async function main(): Promise<void> {
  const { database, migrator } = await createMigrationRunner(getEnvironment());
  try {
    await withMigrationLock(database, async () => {
      await reconcileLegacyMigrationHistory(database, migrator);
      await migrator.up();
    });
  } finally {
    await database.close();
  }
}

main().catch((error: unknown) => {
  process.stderr.write(`${error instanceof Error ? error.message : 'Migration failed'}\n`);
  process.exitCode = 1;
});
