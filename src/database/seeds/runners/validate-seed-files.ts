import {
  frequencySeedSchema,
  mockSeedSchema,
  qualityDimensionSeedSchema,
  unitSeedSchema,
} from '../schemas/seed.schemas';
import { readSeed } from './seed.utils';

/** Validates both permitted persistent seed catalogs without connecting to PostgreSQL. */
export async function validateSeedFiles(): Promise<void> {
  await Promise.all([
    readSeed('boot/frequencies.json', frequencySeedSchema),
    readSeed('boot/quality-dimensions.json', qualityDimensionSeedSchema),
    readSeed('boot/units.json', unitSeedSchema),
    readSeed('mock/observatory-demo.json', mockSeedSchema),
  ]);
}

if (require.main === module) {
  validateSeedFiles().catch((error: unknown) => {
    process.stderr.write(`${error instanceof Error ? error.message : 'Seed validation failure'}\n`);
    process.exitCode = 1;
  });
}
