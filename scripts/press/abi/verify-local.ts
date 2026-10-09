import { strict as assert } from 'node:assert';
import { getEnvironment } from '../../../src/config/environment';
import { createMigrationRunner } from '../../../src/database/migration.runner';
import { runBootSeeds } from '../../../src/database/seeds/runners/run-boot-seeds';

async function main(): Promise<void> {
  const url = 'postgres://postgres:abi-local-test@127.0.0.1:55440/observatorio_abi_test';
  Object.assign(process.env, { NODE_ENV: 'test', DATABASE_WRITER_URL: url, DATABASE_READER_URL: url,
    DATABASE_MIGRATOR_URL: url, DATABASE_SSL: 'false', AUTH_MODE: 'disabled', ADMIN_ENVIRONMENT_ID: 'abi-local-test' });
  const { database, migrator } = await createMigrationRunner(getEnvironment());
  try {
    console.log('ABI isolated database: applying migrations');
    await migrator.up();
    console.log('ABI loading corpus');
    await runBootSeeds('abi-news');
    const count = async (): Promise<number> => {
      const [rows] = await database.query("SELECT count(*)::integer AS n FROM intelligence.raw_observation WHERE payload_json ->> 'abiKey' IS NOT NULL");
      return (rows[0] as { n: number }).n;
    };
    const before = await count();
    assert.ok(before > 8000);
    console.log(`ABI first load: ${before} observations; replaying`);
    await runBootSeeds('abi-news');
    assert.equal(await count(), before, 'Replay created duplicates');
    const [summary] = await database.query(`SELECT count(*)::integer AS articles,
      count(*) FILTER (WHERE jsonb_array_length(article -> 'mentions') > 0)::integer AS company_articles
      FROM read_models.abi_article_snapshot`);
    console.log('ABI idempotency verified', summary);
  } finally { await database.close(); }
}
main().catch((error: unknown) => { console.error(error instanceof Error ? error.message : error); process.exitCode = 1; });
