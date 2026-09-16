import type { Transaction } from 'sequelize';
import { reconcileAgentBootstrap } from '../../database/seeds/runners/boot-seed.agent-bootstrap';
import { reconcileBbvYields } from '../../database/seeds/runners/boot-seed.bbv-yields';
import { reconcileBcbQuotes } from '../../database/seeds/runners/boot-seed.bcb-quotes';
import { reconcileBoliviaNationalPoi } from '../../database/seeds/runners/boot-seed.bolivia-national-poi';
import { reconcileBoliviaPoi } from '../../database/seeds/runners/boot-seed.bolivia-poi';
import { reconcileCompanyFilingTexts } from '../../database/seeds/runners/boot-seed.company-filing-texts';
import { reconcileCompanyFilings } from '../../database/seeds/runners/boot-seed.company-filings';
import { reconcileCompanyFilingArchive } from '../../database/seeds/runners/boot-seed.company-filings-archive';
import { reconcileCompositeIndices } from '../../database/seeds/runners/boot-seed.composite-indices';
import { CORE_CATALOGUE_UNITS } from '../../database/seeds/runners/boot-seed.core-catalogues';
import { reconcileExchangeRateHistory } from '../../database/seeds/runners/boot-seed.exchange-rate-history';
import { reconcileForeignTrade } from '../../database/seeds/runners/boot-seed.foreign-trade';
import { reconcileMacroAnnualHistory } from '../../database/seeds/runners/boot-seed.macro-annual-history';
import { reconcileMarketPrices } from '../../database/seeds/runners/boot-seed.market-prices';
import {
  PRESS_ARCHIVE_YEARS,
  reconcilePressArchiveYear,
} from '../../database/seeds/runners/boot-seed.press-archive';
import { reconcilePressCoverage } from '../../database/seeds/runners/boot-seed.press-coverage';
import { reconcileSourceSchedules } from '../../database/seeds/runners/boot-seed.source-schedules';
import { reconcileSocialReadings } from '../../database/seeds/runners/boot-seed.social-readings';
import { reconcileUfvHistory } from '../../database/seeds/runners/boot-seed.ufv-history';
import { reconcileWorldBankPanel } from '../../database/seeds/runners/boot-seed.worldbank-panel';
import { mockSeedSchema } from '../../database/seeds/schemas/seed.schemas';
import { reconcileMockMetadata } from '../../database/seeds/runners/mock-seed.metadata';
import { reconcileMockProvenance } from '../../database/seeds/runners/mock-seed.provenance';
import { reconcileMockSemantics } from '../../database/seeds/runners/mock-seed.semantic';
import { readSeed } from '../../database/seeds/runners/seed.utils';

/**
 * One step of a package that commits, and is checkpointed, on its own.
 *
 * Splitting a package into steps is what makes an interrupted corpus resumable:
 * the step's key is written into the run's checkpoint in the same transaction
 * that applied it, so a resumed run knows exactly what already landed. A
 * package with one step is not a special case — it is a package whose only safe
 * unit of work is the whole thing.
 */
export interface SeedUnit {
  readonly key: string;
  apply(transaction: Transaction): Promise<void>;
}

/** Loaders that need the collector source the observatory signs backfills with. */
type SourcedLoader = (sourceId: string, transaction: Transaction) => Promise<unknown>;

/**
 * Runs the collector identities first, then the corpus, inside one step.
 *
 * `reconcileAgentBootstrap` is idempotent and cheap, and it returns the source
 * every historical loader writes under. Calling it here rather than caching a
 * identifier across transactions means a corpus can never be written against a
 * source row that was rolled back.
 */
function sourced(key: string, load: SourcedLoader): SeedUnit {
  return {
    key,
    apply: async (transaction: Transaction): Promise<void> => {
      const identities = await reconcileAgentBootstrap(transaction);
      await load(identities.sourceId, transaction);
    },
  };
}

function single(key: string, load: SourcedLoader): readonly SeedUnit[] {
  return [sourced(key, load)];
}

const CORE_UNITS: readonly SeedUnit[] = CORE_CATALOGUE_UNITS.map(([key, reconcile]) => ({
  key,
  apply: (transaction: Transaction) => reconcile(transaction),
}));

const IDENTITY_UNITS: readonly SeedUnit[] = [
  {
    key: 'agent-bootstrap',
    apply: async (transaction: Transaction): Promise<void> => {
      await reconcileAgentBootstrap(transaction);
    },
  },
];

/**
 * The press archive, one year per transaction.
 *
 * Seven years is roughly a hundred thousand articles, and loading them in one
 * transaction meant an interruption at the sixth year discarded the five that
 * had already committed. Year by year, a resumed run starts where it stopped.
 */
const PRESS_ARCHIVE_UNITS: readonly SeedUnit[] = PRESS_ARCHIVE_YEARS.map((year) =>
  sourced(`press-archive-${year}`, (sourceId, transaction) =>
    reconcilePressArchiveYear(year, sourceId, transaction),
  ),
);

const SCHEDULE_UNITS: readonly SeedUnit[] = [
  {
    key: 'source-schedules',
    apply: async (transaction: Transaction): Promise<void> => {
      await reconcileSourceSchedules(transaction);
    },
  },
];

const DEMO_UNITS: readonly SeedUnit[] = [
  {
    key: 'observatory-demo',
    apply: async (transaction: Transaction): Promise<void> => {
      const seed = await readSeed('mock/observatory-demo.json', mockSeedSchema);
      await reconcileMockProvenance(seed, transaction);
      await reconcileMockSemantics(seed, transaction);
      await reconcileMockMetadata(seed, transaction);
    },
  },
];

/**
 * Every package this build knows how to apply, and the steps it applies as.
 *
 * A package with no entry here cannot be reconciled through the portal at all,
 * which is the intended failure: the API takes a package code from an
 * allowlist, never a script name, a path or a SQL statement.
 */
export const SEED_UNITS: Readonly<Record<string, readonly SeedUnit[]>> = {
  'core-catalogues': CORE_UNITS,
  'collector-identities': IDENTITY_UNITS,
  'source-schedules': SCHEDULE_UNITS,
  'exchange-rate-history': single('exchange-rate-history', reconcileExchangeRateHistory),
  'macro-annual-history': single('macro-annual-history', reconcileMacroAnnualHistory),
  'market-prices': single('market-prices', reconcileMarketPrices),
  'bcb-quotes': single('bcb-quotes', reconcileBcbQuotes),
  'ufv-history': single('ufv-history', reconcileUfvHistory),
  'bbv-yields': single('bbv-yields', reconcileBbvYields),
  'composite-indices': single('composite-indices', reconcileCompositeIndices),
  'foreign-trade': single('foreign-trade', reconcileForeignTrade),
  'company-filings': single('company-filings', reconcileCompanyFilings),
  'company-filings-archive': single('company-filings-archive', reconcileCompanyFilingArchive),
  'company-filing-texts': single('company-filing-texts', reconcileCompanyFilingTexts),
  'press-coverage': single('press-coverage', reconcilePressCoverage),
  'press-archive': PRESS_ARCHIVE_UNITS,
  'social-readings': single('social-readings', reconcileSocialReadings),
  'worldbank-panel': single('worldbank-panel', reconcileWorldBankPanel),
  'bolivia-poi': single('bolivia-poi', reconcileBoliviaPoi),
  'bolivia-national-poi': single('bolivia-national-poi', reconcileBoliviaNationalPoi),
  'observatory-demo': DEMO_UNITS,
};
