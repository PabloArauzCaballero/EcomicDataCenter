import 'dotenv/config';
import { getEnvironment } from '../../../config/environment';
import { createWriterDatabase } from '../../database.factory';
import { mockSeedSchema } from '../schemas/seed.schemas';
import { reconcileMockMetadata } from './mock-seed.metadata';
import { reconcileMockProvenance } from './mock-seed.provenance';
import { reconcileMockSemantics } from './mock-seed.semantic';
import { readSeed } from './seed.utils';

/** Loads deterministic synthetic data and refuses to run in production. */
export async function runMockSeeds(): Promise<void> {
  const environment = getEnvironment();
  if (environment.NODE_ENV === 'production') {
    throw new Error('Mock seeds are forbidden in production');
  }

  const database = createWriterDatabase(environment);
  try {
    const seed = await readSeed('mock/observatory-demo.json', mockSeedSchema);
    await database.authenticate();
    await database.transaction(async (transaction) => {
      await reconcileMockProvenance(seed, transaction);
      await reconcileMockSemantics(seed, transaction);
      await reconcileMockMetadata(seed, transaction);
    });
  } finally {
    await database.close();
  }
}

if (require.main === module) {
  runMockSeeds().catch((error: unknown) => {
    process.stderr.write(`${error instanceof Error ? error.message : 'Mock seed failure'}\n`);
    process.exitCode = 1;
  });
}
