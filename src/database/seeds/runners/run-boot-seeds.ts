import 'dotenv/config';
import type { Transaction } from 'sequelize';
import { getEnvironment } from '../../../config/environment';
import { createWriterDatabase } from '../../database.factory';
import {
  ClassificationItemModel,
  ClassificationModel,
  ClassificationVersionModel,
  FrequencyModel,
  GeographicUnitModel,
  OrganizationModel,
  QualityDimensionModel,
  StatisticalDomainModel,
  UnitMeasureModel,
} from '../../models';
import {
  countrySeedSchema,
  currencySeedSchema,
  economicActivitySeedSchema,
  frequencySeedSchema,
  geographicUnitSeedSchema,
  qualityDimensionSeedSchema,
  statisticalDomainSeedSchema,
  unitSeedSchema,
} from '../schemas/seed.schemas';
import { reconcileAgentBootstrap } from './boot-seed.agent-bootstrap';
import { reconcileExchangeRateHistory } from './boot-seed.exchange-rate-history';
import { reconcileCompanyFilings } from './boot-seed.company-filings';
import { reconcileCompanyFilingArchive } from './boot-seed.company-filings-archive';
import { reconcileCompanyFilingTexts } from './boot-seed.company-filing-texts';
import { reconcilePressCoverage } from './boot-seed.press-coverage';
import { reconcilePressArchive } from './boot-seed.press-archive';
import { reconcileMacroAnnualHistory } from './boot-seed.macro-annual-history';
import { reconcileMarketPrices } from './boot-seed.market-prices';
import { reconcileBcbQuotes } from './boot-seed.bcb-quotes';
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

/**
 * Loads the Bolivian territorial hierarchy.
 *
 * Rows are applied in file order because a department references the country;
 * the catalog is authored parent-first for that reason.
 */
async function reconcileGeographicUnits(transaction: Transaction): Promise<void> {
  const rows = await readSeed('boot/geographic-units.json', geographicUnitSeedSchema);
  for (const row of rows) await GeographicUnitModel.upsert(row, { transaction });
}

/** Loads the hierarchical economic domains the agents classify findings into. */
async function reconcileStatisticalDomains(transaction: Transaction): Promise<void> {
  const rows = await readSeed('boot/statistical-domains.json', statisticalDomainSeedSchema);
  for (const row of rows) await StatisticalDomainModel.upsert(row, { transaction });
}

/** Loads ISO-4217 currencies used by exchange-rate and financial series. */
async function reconcileCurrencies(transaction: Transaction): Promise<void> {
  const rows = await readSeed('boot/currencies.json', currencySeedSchema);
  for (const row of rows) await UnitMeasureModel.upsert(row, { transaction });
}

/** Loads the ISO-3166 trading partners referenced by external-sector data. */
async function reconcileCountries(transaction: Transaction): Promise<void> {
  const rows = await readSeed('boot/countries.json', countrySeedSchema);
  for (const row of rows) await GeographicUnitModel.upsert(row, { transaction });
}

/**
 * Loads the official institutions and the CAEB activity classification.
 *
 * Institutions come first because the classification declares a custodian, and
 * the sections are stored as a versioned classification rather than an enum so
 * a future CAEB revision becomes a new version instead of a code change.
 */
async function reconcileEconomicActivities(transaction: Transaction): Promise<void> {
  const seed = await readSeed('boot/economic-activities.json', economicActivitySeedSchema);
  for (const organization of seed.organizations) {
    await OrganizationModel.upsert({ ...organization, validTo: null }, { transaction });
  }
  await ClassificationModel.upsert(seed.classification, { transaction });
  await ClassificationVersionModel.upsert(seed.version, { transaction });
  for (const item of seed.items) {
    await ClassificationItemModel.upsert(item, { transaction });
  }
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
      await reconcileGeographicUnits(transaction);
      await reconcileStatisticalDomains(transaction);
      await reconcileCurrencies(transaction);
      await reconcileCountries(transaction);
      await reconcileEconomicActivities(transaction);
      const identities = await reconcileAgentBootstrap(transaction);
      // Runs last: it needs the backfill identity and the source the block
      // above reconciles.
      await reconcileExchangeRateHistory(identities.sourceId, transaction);
      await reconcileMacroAnnualHistory(identities.sourceId, transaction);
      await reconcileMarketPrices(identities.sourceId, transaction);
      await reconcileBcbQuotes(identities.sourceId, transaction);
      await reconcileCompanyFilings(identities.sourceId, transaction);
      await reconcileCompanyFilingArchive(identities.sourceId, transaction);
      // Runs after the archive: it attaches evidence to the claims that made.
      await reconcileCompanyFilingTexts(identities.sourceId, transaction);
      await reconcilePressCoverage(identities.sourceId, transaction);
      await reconcilePressArchive(identities.sourceId, transaction);
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
