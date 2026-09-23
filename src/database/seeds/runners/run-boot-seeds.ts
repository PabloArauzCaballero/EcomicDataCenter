import 'dotenv/config';
import type { Transaction } from 'sequelize';
import { getEnvironment } from '../../../config/environment';
import { createWriterDatabase } from '../../database.factory';
import { refreshOneSnapshot } from '../../snapshot-refresh';
import { reconcileAgentBootstrap } from './boot-seed.agent-bootstrap';
import { reconcileSourceSchedules } from './boot-seed.source-schedules';
import { CORE_CATALOGUE_UNITS } from './boot-seed.core-catalogues';
import { describeSeedTarget, recordBootApplication } from './boot-seed.ledger';
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
import { reconcileStablecoinBooks } from './boot-seed.stablecoin-books';
import { reconcileBoliviaPoi } from './boot-seed.bolivia-poi';
import { reconcileBoliviaNationalPoi } from './boot-seed.bolivia-national-poi';
import { reconcileUfvHistory } from './boot-seed.ufv-history';
import { reconcileBbvYields } from './boot-seed.bbv-yields';
import { reconcileCompositeIndices } from './boot-seed.composite-indices';
import { reconcileForeignTrade } from './boot-seed.foreign-trade';
import { reconcileMineralTrade } from './boot-seed.mineral-trade';
import { reconcileForeignTradeDetail } from './boot-seed.foreign-trade-detail';
import { reconcileAnnualActivities, reconcileAnnualRegisters } from './boot-seed.annual-register';
import { reconcileWorldBankPanel } from './boot-seed.worldbank-panel';
import { reconcileBoliviaRoadNetwork } from './boot-seed.bolivia-road-network';

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
  'stablecoin-books',
  'ufv-history',
  'bbv-yields',
  'composite-indices',
  'foreign-trade',
  'mineral-trade',
  'foreign-trade-detail',
  'annual-registers',
  'annual-activities',
  'company-filings',
  'company-filings-archive',
  'company-filing-texts',
  'press-coverage',
  'press-archive',
  'social-readings',
  'bolivia-poi',
  'bolivia-national-poi',
  'worldbank-panel',
  'bolivia-road-network',
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

/**
 * The catalogues whose rows the annual panel and its source notes are built from.
 *
 * `foreign-trade` belonged here from the day it was written and was missing:
 * its readings are `frequency: 'ANNUAL'` and land in the same view as the rest,
 * so `--only=foreign-trade` loaded them into the database and left the stored
 * copy — which is what every panel reads — without them. On a full run the
 * refresh happened anyway because every catalogue is wanted, which is why the
 * gap stayed invisible. `mineral-trade` has the same shape and would have
 * inherited the same silence.
 */
const ANNUAL_CATALOGUES: readonly Catalogue[] = [
  'macro-annual-history',
  'composite-indices',
  'ufv-history',
  'bbv-yields',
  'foreign-trade',
  'mineral-trade',
  'foreign-trade-detail',
  'annual-registers',
  'annual-activities',
];

const LOADERS: ReadonlyArray<readonly [Catalogue, Loader]> = [
  ['exchange-rate-history', reconcileExchangeRateHistory],
  ['macro-annual-history', reconcileMacroAnnualHistory],
  ['market-prices', reconcileMarketPrices],
  ['bcb-quotes', reconcileBcbQuotes],
  ['stablecoin-books', reconcileStablecoinBooks],
  ['ufv-history', reconcileUfvHistory],
  ['bbv-yields', reconcileBbvYields],
  ['composite-indices', reconcileCompositeIndices],
  ['foreign-trade', reconcileForeignTrade],
  ['mineral-trade', reconcileMineralTrade],
  ['foreign-trade-detail', reconcileForeignTradeDetail],
  ['annual-registers', reconcileAnnualRegisters],
  ['annual-activities', reconcileAnnualActivities],
  ['company-filings', reconcileCompanyFilings],
  ['company-filings-archive', reconcileCompanyFilingArchive],
  ['company-filing-texts', reconcileCompanyFilingTexts],
  ['press-coverage', reconcilePressCoverage],
  ['press-archive', reconcilePressArchive],
  ['social-readings', reconcileSocialReadings],
  ['worldbank-panel', reconcileWorldBankPanel],
  ['bolivia-poi', reconcileBoliviaPoi],
  ['bolivia-national-poi', reconcileBoliviaNationalPoi],
  ['bolivia-road-network', reconcileBoliviaRoadNetwork],
];

/**
 * One hour: long enough for the largest corpus, short enough to end.
 *
 * It is a ceiling and not an absence of one, so a reconciliation that has
 * genuinely hung still stops instead of holding a connection for a day.
 */
const SEEDING_STATEMENT_CEILING_MS = 3_600_000;

/** Reconciles the minimum non-secret catalog required by every environment. */
export async function runBootSeeds(only?: Catalogue): Promise<void> {
  const wanted = (name: Catalogue): boolean => only === undefined || only === name;
  const environment = getEnvironment();
  /*
   * Provisioning runs under its own statement ceiling, not the request one.
   *
   * The runtime ceiling exists to stop one slow query from holding a request
   * open; a catalogue reconciliation is neither a request nor slow by accident.
   * On a database that already holds the corpus, an upsert over the territory
   * or the CAEB sections can exceed fifteen seconds and be cancelled — and a
   * provisioning run cancelled halfway is exactly the state this loader was
   * rewritten to avoid. The ceiling is raised on the pool rather than with a
   * `SET` statement, because a `SET` reaches one pooled connection and the next
   * query may land on another.
   */
  const database = createWriterDatabase({
    ...environment,
    DATABASE_STATEMENT_TIMEOUT_MS: SEEDING_STATEMENT_CEILING_MS,
  });
  try {
    await database.authenticate();

    /*
     * Las filas a las que apuntan todas las demas, y la identidad con la que se
     * firman. Van juntas y primero porque ningun catalogo puede cargarse sin
     * ellas; cuestan poco y son las mismas en todos los entornos.
     */
    /*
     * Where this load is landing, for the register the portal reads.
     *
     * Host, port and database name identify the target without carrying the
     * credential that reached it, and they are what the seed ledger is keyed by.
     */
    const target = describeSeedTarget(environment.DATABASE_WRITER_URL);
    const environmentId = environment.ADMIN_ENVIRONMENT_ID;

    const identities = await database.transaction(async (transaction) => {
      for (const [, reconcile] of CORE_CATALOGUE_UNITS) await reconcile(transaction);
      const bootstrapped = await reconcileAgentBootstrap(transaction);
      // The calendars go in with the sources they name, in the same
      // transaction: a deployment that carries a source and not its declared
      // cadence reports «sin evidencia» for it, which is true but useless.
      await reconcileSourceSchedules(transaction);
      return bootstrapped;
    });
    // Recorded after the transaction that applied them, so a rollback cannot
    // leave the ledger claiming a catalogue the database does not hold.
    for (const code of ['core-catalogues', 'collector-identities', 'source-schedules']) {
      await recordBootApplication(database, environmentId, target, code);
    }

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
        await recordBootApplication(database, environmentId, target, name);
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
    /*
     * Through the routine that is allowed to refresh, not the raw statement.
     *
     * `REFRESH MATERIALIZED VIEW` requires ownership of the view; no grant
     * substitutes for it. The raw statement here worked in production only
     * because that writer owns more than the design supposes, and failed on
     * every database whose privileges match it — which is why continuous
     * integration reported `permission denied for schema read_models` after
     * loading all sixteen catalogues correctly.
     */
    if (wanted('press-coverage') || wanted('press-archive')) {
      await refreshOneSnapshot(database, 'press_article_snapshot', true);
      await refreshOneSnapshot(database, 'press_term_mention_snapshot', true);
    }
    if (wanted('social-readings')) {
      await refreshOneSnapshot(database, 'social_reading_snapshot', true);
    }
    /*
     * The annual panel is a stored copy too, and until 2026-09-21 nothing here
     * rebuilt it. The API refreshes only the copies that were never built, and
     * it starts beside this loader rather than after it, so a catalogue that
     * arrived with new series - twenty-five freedom indices, that day - was in
     * the database and absent from every panel until somebody refreshed by
     * hand. This copy is a few thousand rows; rebuilding it costs seconds.
     */
    if (ANNUAL_CATALOGUES.some((name) => wanted(name))) {
      await refreshOneSnapshot(database, 'macro_indicator_annual_snapshot', true);
      await refreshOneSnapshot(database, 'indicator_source_note_snapshot', true);
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
