import 'dotenv/config';

/**
 * Loads the boot seeds through Neon's direct endpoint rather than its pooler.
 *
 * The whole load is one transaction by design — either the corpus lands or
 * nothing does — and a pooled connection is the wrong place for a transaction
 * that runs for the better part of an hour: the pooler is built to hand
 * sessions around, and a long one is what it is least suited to hold.
 */
for (const key of ['DATABASE_WRITER_URL', 'DATABASE_MIGRATOR_URL', 'DATABASE_READER_URL']) {
  const url = process.env[key];
  if (url?.includes('-pooler')) process.env[key] = url.replace('-pooler', '');
}
const { runBootSeeds } = await import('../src/database/seeds/runners/run-boot-seeds.ts');
const started = Date.now();
await runBootSeeds();
console.log(`seeds cargados en ${Math.round((Date.now() - started) / 1000)} s`);
