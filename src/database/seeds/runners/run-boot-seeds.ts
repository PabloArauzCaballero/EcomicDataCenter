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
import { reconcileSocialReadings } from './boot-seed.social-readings';
import { reconcileMacroAnnualHistory } from './boot-seed.macro-annual-history';
import { reconcileMarketPrices } from './boot-seed.market-prices';
import { reconcileBcbQuotes } from './boot-seed.bcb-quotes';
import { reconcileBoliviaPoi } from './boot-seed.bolivia-poi';
import { reconcileBoliviaNationalPoi } from './boot-seed.bolivia-national-poi';
import { reconcileUfvHistory } from './boot-seed.ufv-history';
import { reconcileBbvYields } from './boot-seed.bbv-yields';
import { reconcileCompositeIndices } from './boot-seed.composite-indices';
import { reconcileForeignTrade } from './boot-seed.foreign-trade';
import { reconcileWorldBankPanel } from './boot-seed.worldbank-panel';
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

/**
 * The heavy catalogues, by the name they can be asked for on their own.
 *
 * Every one of them is idempotent, so loading all of them is always correct and
 * is what happens by default. What it is not is quick: against a remote
 * database the full replay runs for well over ten minutes inside a single
 * transaction, and a load interrupted at minute nine rolls back the catalogue
 * somebody actually came to load. Naming them lets one be reloaded on its own
 * without replaying the other fourteen.
 *
 * The small catalogues above them — frequencies, units, territory, activities,
 * agent identities — always run: they are the rows every other catalogue points
 * at, and they cost nothing.
 */
const SELECTABLE = [
  'exchange-rate-history',
  'macro-annual-history',
  'market-prices',
  'bcb-quotes',
  'ufv-history',
  'bbv-yields',
  'composite-indices',
  'foreign-trade',
  'company-filings',
  'company-filings-archive',
  'company-filing-texts',
  'press-coverage',
  'press-archive',
  'social-readings',
  'bolivia-poi',
  'bolivia-national-poi',
  'worldbank-panel',
] as const;

type Catalogue = (typeof SELECTABLE)[number];

/**
 * Which catalogue was asked for, if any. `--only=<nombre>`.
 *
 * An unknown name stops the run instead of quietly loading nothing but the base
 * catalogues, which would look like a successful load of the thing that was
 * misspelled.
 */
function requestedCatalogue(argv: readonly string[]): Catalogue | undefined {
  const flag = argv.find((argument) => argument.startsWith('--only='));
  if (!flag) return undefined;
  const name = flag.slice('--only='.length);
  if (!SELECTABLE.includes(name as Catalogue)) {
    throw new Error(`Catálogo desconocido: ${name}. Opciones: ${SELECTABLE.join(', ')}`);
  }
  return name as Catalogue;
}

/**
 * Cada catalogo con su nombre y su cargador, en el orden en que deben correr.
 *
 * El archivo de hechos relevantes va antes que sus textos, que se cuelgan de las
 * afirmaciones que aquel crea; el resto es independiente entre si.
 */
type Loader = (sourceId: string, transaction: Transaction) => Promise<unknown>;

const LOADERS: ReadonlyArray<readonly [Catalogue, Loader]> = [
  ['exchange-rate-history', reconcileExchangeRateHistory],
  ['macro-annual-history', reconcileMacroAnnualHistory],
  ['market-prices', reconcileMarketPrices],
  ['bcb-quotes', reconcileBcbQuotes],
  ['ufv-history', reconcileUfvHistory],
  ['bbv-yields', reconcileBbvYields],
  ['composite-indices', reconcileCompositeIndices],
  ['foreign-trade', reconcileForeignTrade],
  ['company-filings', reconcileCompanyFilings],
  ['company-filings-archive', reconcileCompanyFilingArchive],
  ['company-filing-texts', reconcileCompanyFilingTexts],
  ['press-coverage', reconcilePressCoverage],
  ['press-archive', reconcilePressArchive],
  ['social-readings', reconcileSocialReadings],
  ['worldbank-panel', reconcileWorldBankPanel],
  ['bolivia-poi', reconcileBoliviaPoi],
  ['bolivia-national-poi', reconcileBoliviaNationalPoi],
];

/** Reconciles the minimum non-secret catalog required by every environment. */
export async function runBootSeeds(only?: Catalogue): Promise<void> {
  const wanted = (name: Catalogue): boolean => only === undefined || only === name;
  const database = createWriterDatabase(getEnvironment());
  try {
    await database.authenticate();

    /*
     * Las filas a las que apuntan todas las demas, y la identidad con la que se
     * firman. Van juntas y primero porque ningun catalogo puede cargarse sin
     * ellas; cuestan poco y son las mismas en todos los entornos.
     */
    const identities = await database.transaction(async (transaction) => {
      await reconcileFrequencies(transaction);
      await reconcileQualityDimensions(transaction);
      await reconcileUnits(transaction);
      await reconcileGeographicUnits(transaction);
      await reconcileStatisticalDomains(transaction);
      await reconcileCurrencies(transaction);
      await reconcileCountries(transaction);
      await reconcileEconomicActivities(transaction);
      return reconcileAgentBootstrap(transaction);
    });

    /*
     * Un catalogo por transaccion, y no los dieciseis en una.
     *
     * Es la regla que los lotes de recoleccion ya siguen —«un lote que falla
     * cuesta sus fuentes y ninguna mas»— y que esta carga no seguia. En una sola
     * transaccion, un catalogo que revienta al minuto nueve deshace los quince
     * que ya habian entrado, incluido el que alguien venia a cargar; y como este
     * servicio corre desacoplado y nadie espera su resultado, el dia entero se
     * pierde sin una linea roja que lo diga.
     *
     * Separarlos es seguro porque cada sembrador ya es idempotente por si mismo:
     * concilian por adicion, comparando la huella de cada registro, sin un solo
     * `destroy`, `truncate` ni `delete` entre todos ellos.
     *
     * Un fallo no detiene a los siguientes, pero si se acumula: al final se
     * lanza con todos los nombres juntos, porque una carga a medias que termina
     * en verde es como llevabamos dos semanas.
     */
    const failed: string[] = [];
    for (const [name, load] of LOADERS) {
      if (!wanted(name)) continue;
      try {
        await database.transaction((transaction) => load(identities.sourceId, transaction));
      } catch (error) {
        failed.push(name);
        process.stderr.write(
          `catalogo ${name}: ${error instanceof Error ? error.message : 'fallo desconocido'}
`,
        );
      }
    }

    /*
     * Outside the transaction, because a materialised view cannot be refreshed
     * concurrently inside one — and because until it is refreshed the report
     * serves the corpus as it stood before this load.
     */
    await database.query('SET statement_timeout = 0');
    if (wanted('press-coverage') || wanted('press-archive')) {
      await database.query(
        'REFRESH MATERIALIZED VIEW CONCURRENTLY read_models.press_article_snapshot',
      );
      await database.query(
        'REFRESH MATERIALIZED VIEW CONCURRENTLY read_models.press_term_mention_snapshot',
      );
    }
    if (wanted('social-readings')) {
      await database.query(
        'REFRESH MATERIALIZED VIEW CONCURRENTLY read_models.social_reading_snapshot',
      );
    }

    if (failed.length > 0) {
      throw new Error(`catalogos que no cargaron: ${failed.join(', ')}`);
    }
  } finally {
    await database.close();
  }
}

if (require.main === module) {
  runBootSeeds(requestedCatalogue(process.argv.slice(2))).catch((error: unknown) => {
    process.stderr.write(`${error instanceof Error ? error.message : 'Boot seed failure'}\n`);
    process.exitCode = 1;
  });
}
