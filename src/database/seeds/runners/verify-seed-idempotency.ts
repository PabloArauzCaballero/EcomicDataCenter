import 'dotenv/config';
import { getEnvironment } from '../../../config/environment';
import { createWriterDatabase } from '../../database.factory';
import { runBootSeeds } from './run-boot-seeds';
import { runMockSeeds } from './run-mock-seeds';
import { captureBootSeedHash, captureMockSeedHash } from './seed-snapshot';

function assertSame(first: string, second: string, catalog: string): void {
  if (first !== second) throw new Error(`${catalog} seeds changed their logical state on second execution`);
}

/** Executes each permitted catalog twice and compares its complete deterministic state. */
export async function verifySeedIdempotency(): Promise<void> {
  const environment = getEnvironment();
  const database = createWriterDatabase(environment);
  try {
    await runBootSeeds();
    const bootFirst = await captureBootSeedHash(database);
    await runBootSeeds();
    const bootSecond = await captureBootSeedHash(database);
    assertSame(bootFirst, bootSecond, 'Boot');

    if (environment.NODE_ENV !== 'production') {
      await runMockSeeds();
      const mockFirst = await captureMockSeedHash(database);
      await runMockSeeds();
      const mockSecond = await captureMockSeedHash(database);
      assertSame(mockFirst, mockSecond, 'Mock');
      return;
    }

    let rejected = false;
    try {
      await runMockSeeds();
    } catch {
      rejected = true;
    }
    if (!rejected) throw new Error('Mock seeds were not rejected in production');
  } finally {
    await database.close();
  }
}

if (require.main === module) {
  verifySeedIdempotency().catch((error: unknown) => {
    process.stderr.write(`${error instanceof Error ? error.message : 'Seed verification failure'}\n`);
    process.exitCode = 1;
  });
}
