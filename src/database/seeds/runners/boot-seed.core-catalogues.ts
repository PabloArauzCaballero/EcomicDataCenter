import type { Transaction } from 'sequelize';
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
import { readSeed } from './seed.utils';

/**
 * The catalogues every other row in the database points at.
 *
 * They were defined inside the boot runner, which made them unreachable from
 * anywhere else: the administrative portal has to be able to reconcile them one
 * at a time, under an operator's authority, and report which of them is out of
 * step — none of which is possible while they are private to a script. Nothing
 * about what they load changed in moving them here.
 */

export async function reconcileFrequencies(transaction: Transaction): Promise<void> {
  const rows = await readSeed('boot/frequencies.json', frequencySeedSchema);
  for (const row of rows) await FrequencyModel.upsert(row, { transaction });
}

export async function reconcileQualityDimensions(transaction: Transaction): Promise<void> {
  const rows = await readSeed('boot/quality-dimensions.json', qualityDimensionSeedSchema);
  for (const row of rows) await QualityDimensionModel.upsert(row, { transaction });
}

export async function reconcileUnits(transaction: Transaction): Promise<void> {
  const rows = await readSeed('boot/units.json', unitSeedSchema);
  for (const row of rows) await UnitMeasureModel.upsert(row, { transaction });
}

/**
 * Loads the Bolivian territorial hierarchy.
 *
 * Rows are applied in file order because a department references the country;
 * the catalog is authored parent-first for that reason.
 */
export async function reconcileGeographicUnits(transaction: Transaction): Promise<void> {
  const rows = await readSeed('boot/geographic-units.json', geographicUnitSeedSchema);
  for (const row of rows) await GeographicUnitModel.upsert(row, { transaction });
}

/** Loads the hierarchical economic domains the agents classify findings into. */
export async function reconcileStatisticalDomains(transaction: Transaction): Promise<void> {
  const rows = await readSeed('boot/statistical-domains.json', statisticalDomainSeedSchema);
  for (const row of rows) await StatisticalDomainModel.upsert(row, { transaction });
}

/** Loads ISO-4217 currencies used by exchange-rate and financial series. */
export async function reconcileCurrencies(transaction: Transaction): Promise<void> {
  const rows = await readSeed('boot/currencies.json', currencySeedSchema);
  for (const row of rows) await UnitMeasureModel.upsert(row, { transaction });
}

/** Loads the ISO-3166 trading partners referenced by external-sector data. */
export async function reconcileCountries(transaction: Transaction): Promise<void> {
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
export async function reconcileEconomicActivities(transaction: Transaction): Promise<void> {
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

/**
 * The catalogues in the only order their foreign keys admit.
 *
 * Territory before countries because both write `geographic_unit` and the
 * country rows are parents of nothing here; activities last because they
 * declare a custodian organisation.
 */
export const CORE_CATALOGUE_UNITS: ReadonlyArray<
  readonly [string, (transaction: Transaction) => Promise<void>]
> = [
  ['frequencies', reconcileFrequencies],
  ['quality-dimensions', reconcileQualityDimensions],
  ['units', reconcileUnits],
  ['geographic-units', reconcileGeographicUnits],
  ['statistical-domains', reconcileStatisticalDomains],
  ['currencies', reconcileCurrencies],
  ['countries', reconcileCountries],
  ['economic-activities', reconcileEconomicActivities],
];
