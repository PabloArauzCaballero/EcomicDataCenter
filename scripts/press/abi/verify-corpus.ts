import { strict as assert } from 'node:assert';
import { readFileSync } from 'node:fs';
import { getEnvironment } from '../../../src/config/environment';
import { createWriterDatabase } from '../../../src/database/database.factory';
import { reconcileAgentBootstrap } from '../../../src/database/seeds/runners/boot-seed.agent-bootstrap';
import { reconcileAbiNews } from '../../../src/database/seeds/runners/boot-seed.abi-news';

/** Recheck ABI alone after verify-local has provisioned the isolated local schema. */
async function main(): Promise<void> {
  const url = 'postgres://postgres:abi-local-test@127.0.0.1:55440/observatorio_abi_test';
  Object.assign(process.env, {
    NODE_ENV: 'test',
    DATABASE_WRITER_URL: url,
    DATABASE_READER_URL: url,
    DATABASE_MIGRATOR_URL: url,
    DATABASE_SSL: 'false',
    AUTH_MODE: 'disabled',
    ADMIN_ENVIRONMENT_ID: 'abi-local-test',
  });
  const database = createWriterDatabase({
    ...getEnvironment(),
    DATABASE_STATEMENT_TIMEOUT_MS: 300000,
  });
  try {
    await database.authenticate();
    const { sourceId } = await database.transaction(reconcileAgentBootstrap);
    const load = () =>
      database.transaction((transaction) => reconcileAbiNews(sourceId, transaction));
    const count = async (): Promise<number> => {
      const [rows] = await database.query(
        "SELECT count(*)::integer AS n FROM intelligence.raw_observation WHERE payload_json ->> 'abiKey' IS NOT NULL",
      );
      return (rows[0] as { n: number }).n;
    };
    await load();
    const before = await count();
    await load();
    assert.equal(await count(), before, 'Replay created duplicate observations');
    await database.query('SELECT read_models.refresh_abi_news()');
    const [rows] = await database.query(`SELECT count(*)::integer AS articles,
      count(*) FILTER (WHERE jsonb_array_length(article -> 'mentions') > 0)::integer AS company_articles,
      count(*) FILTER (WHERE article -> 'author' ->> 'name' IS NOT NULL)::integer AS authors_named,
      count(*) FILTER (WHERE jsonb_array_length(article -> 'images') > 0)::integer AS with_images
      FROM read_models.abi_article_snapshot`);
    const actual = rows[0] as {
      articles: number;
      company_articles: number;
      authors_named: number;
      with_images: number;
    };
    const manifest = JSON.parse(
      readFileSync('src/database/seeds/boot/abi-news/manifest.json', 'utf8'),
    ) as {
      articles: number;
      companyArticles: number;
      authorsNamed: number;
      articlesWithImages: number;
    };
    assert.equal(actual.articles, manifest.articles);
    assert.equal(actual.company_articles, manifest.companyArticles);
    assert.equal(actual.authors_named, manifest.authorsNamed);
    assert.equal(actual.with_images, manifest.articlesWithImages);
    console.log(JSON.stringify({ idempotent: true, ...actual, observations: before }));
  } finally {
    await database.close();
  }
}
main().catch((error: unknown) => {
  console.error(error instanceof Error ? error.message : error);
  process.exitCode = 1;
});
