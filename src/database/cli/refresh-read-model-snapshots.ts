import 'dotenv/config';
import { getEnvironment } from '../../config/environment';
import { createWriterDatabase } from '../database.factory';
import { refreshSnapshots, withPinnedSession } from '../snapshot-refresh';

/**
 * Rebuilds the stored copies migration 0072 created, from inside the image.
 *
 * The API fills the empty ones itself when it starts; this is for the other
 * case, when an operator wants every copy rebuilt now — after a seed load, or
 * after a collector run that changed what the registers should say. That is a
 * decision to take on purpose, so it lives in a command rather than in a boot.
 *
 * The rebuild itself, its lock and its guards live in `../snapshot-refresh`,
 * shared with the boot path so the two cannot drift apart.
 */
async function main(): Promise<void> {
  const database = createWriterDatabase(getEnvironment());
  try {
    await database.authenticate();
    process.stdout.write('reconstruyendo las copias guardadas\n');
    const outcome = await withPinnedSession(database, (session) =>
      refreshSnapshots(
        session,
        {
          line: (text) => process.stdout.write(`  ${text}\n`),
          problem: (text) => process.stderr.write(`  ${text}\n`),
        },
        { onlyUnbuilt: false },
      ),
    );

    if (outcome === null) {
      process.stderr.write(
        'ya hay una reconstruccion en curso sobre esta base; esta se retira sin tocar nada.\n' +
          'Si la anterior murio con su cliente, PostgreSQL la cancela sola en unos segundos.\n',
      );
      process.exitCode = 2;
      return;
    }
    if (outcome.failed.length > 0) {
      process.stderr.write(`\nno se pudieron reconstruir: ${outcome.failed.join(', ')}\n`);
      process.exitCode = 1;
    }
  } finally {
    await database.close();
  }
}

main().catch((error: unknown) => {
  process.stderr.write(`${error instanceof Error ? error.message : 'Snapshot refresh failed'}\n`);
  process.exitCode = 1;
});
