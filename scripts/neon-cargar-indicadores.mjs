import 'dotenv/config';

/**
 * Loads the indicator blocks into the live branch, one transaction per block.
 *
 * `neon-seed-directo.mjs` reconciles the whole corpus inside a single
 * transaction, which is right when the database is empty and wrong here: the
 * press archive and the filings register are already loaded, so an hour of that
 * run is spent hashing rows that will be skipped, and an interruption at minute
 * fifty-nine throws away the work of the first fifty-eight.
 *
 * So each block commits on its own. The loaders are idempotent on the payload
 * digest, so a re-run after an interruption skips what already landed and
 * resumes where it stopped, rather than starting over.
 *
 * Through the direct endpoint rather than the pooler, for the reason the other
 * script gives: the pooler is built to hand sessions around, and a transaction
 * that runs for minutes is what it is least suited to hold.
 */

for (const key of ['DATABASE_WRITER_URL', 'DATABASE_MIGRATOR_URL', 'DATABASE_READER_URL']) {
  const url = process.env[key];
  if (url?.includes('-pooler')) process.env[key] = url.replace('-pooler', '');
}

const { getEnvironment } = await import('../src/config/environment.ts');
const { createWriterDatabase } = await import('../src/database/database.factory.ts');
const { reconcileAgentBootstrap } =
  await import('../src/database/seeds/runners/boot-seed.agent-bootstrap.ts');
const { reconcileMacroAnnualHistory } =
  await import('../src/database/seeds/runners/boot-seed.macro-annual-history.ts');
const { reconcileUfvHistory } =
  await import('../src/database/seeds/runners/boot-seed.ufv-history.ts');
const { reconcileBbvYields } =
  await import('../src/database/seeds/runners/boot-seed.bbv-yields.ts');
const { reconcileCompositeIndices } =
  await import('../src/database/seeds/runners/boot-seed.composite-indices.ts');
const { reconcileCompanyFilingArchive } =
  await import('../src/database/seeds/runners/boot-seed.company-filings-archive.ts');
const { reconcileCompanyFilingTexts } =
  await import('../src/database/seeds/runners/boot-seed.company-filing-texts.ts');

const database = createWriterDatabase(getEnvironment());
await database.authenticate();
console.log('destino:', new URL(process.env.DATABASE_WRITER_URL).hostname);

/** The bootstrap runs first and alone: every block below cites its source. */
const { sourceId } = await database.transaction((transaction) =>
  reconcileAgentBootstrap(transaction),
);
console.log('identidades reconciliadas');

const blocks = {
  macro: ['series anuales del compilador', reconcileMacroAnnualHistory],
  indices: ['indices compuestos', reconcileCompositeIndices],
  bbv: ['curva de la BBV', reconcileBbvYields],
  ufv: ['UFV diaria desde 2001', reconcileUfvHistory],
  // The register is nineteen thousand filings against the four hundred the
  // rest of the blocks hold together, so it is named on its own and run alone.
  hechos: ['registro de hechos relevantes de la BBV', reconcileCompanyFilingArchive],
  // After `hechos`: it attaches each filing's own page to the claim that block
  // created, and matches on the identifier the register's payload carries.
  textos: ['textos propios de los hechos relevantes', reconcileCompanyFilingTexts],
};

/**
 * Blocks named on the command line, or all of them.
 *
 * Naming one keeps a run inside a window a caller can afford to lose, which
 * matters more than convenience here: the load has already been interrupted
 * twice, and a block that commits is a block that never has to run again.
 */
const requested = process.argv.slice(2).filter((name) => name in blocks);
for (const name of requested.length ? requested : Object.keys(blocks)) {
  const [label, reconcile] = blocks[name];
  const started = Date.now();
  await database.transaction((transaction) => reconcile(sourceId, transaction));
  console.log(`  ${label}: listo en ${Math.round((Date.now() - started) / 1000)} s`);
}

await database.close();
console.log('CARGA COMPLETA');
