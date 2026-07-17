import 'dotenv/config';
import type { Transaction } from 'sequelize';
import { getEnvironment } from '../../../config/environment';
import { createWriterDatabase } from '../../database.factory';
import { FrequencyModel, QualityDimensionModel, UnitMeasureModel } from '../../models';
import {
  frequencySeedSchema,
  qualityDimensionSeedSchema,
  unitSeedSchema,
} from '../schemas/seed.schemas';
import { readSeed } from './seed.utils';

async function reconcileFrequencies(transaction: Transaction): Promise<void> {
  const rows = await readSeed('boot/frequencies.json', frequencySeedSchema);
  for (const row of rows) await FrequencyModel.upsert(row, { transaction });
}

async function reconcileQualityDimensions(transaction: Transaction): Promise<void> {
  const rows = await readSeed('boot/quality-dimensions.json', qualityDimensionSeedSchema);
  for (const row of rows) await QualityDimensionModel.upsert(row, { transaction });
}

async function reconcileUnits(transaction: Transaction): Promise<void> {
  const rows = await readSeed('boot/units.json', unitSeedSchema);
  for (const row of rows) await UnitMeasureModel.upsert(row, { transaction });
}

/** Reconciles the minimum non-secret catalog required by every environment. */
export async function runBootSeeds(): Promise<void> {
  const database = createWriterDatabase(getEnvironment());
  try {
    await database.authenticate();
    await database.transaction(async (transaction) => {
      await reconcileFrequencies(transaction);
      await reconcileQualityDimensions(transaction);
      await reconcileUnits(transaction);
    });
  } finally {
    await database.close();
  }
}

if (require.main === module) {
  runBootSeeds().catch((error: unknown) => {
    process.stderr.write(`${error instanceof Error ? error.message : 'Boot seed failure'}\n`);
    process.exitCode = 1;
  });
}
