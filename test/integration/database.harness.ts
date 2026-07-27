import { Sequelize } from 'sequelize';

/**
 * Connects the integration suite to a disposable PostgreSQL instance.
 *
 * The URL is taken only from an explicit integration variable, never from the
 * ambient `.env`, so a suite that truncates tables can never reach a remote or
 * production database because a shell forgot an override.
 */
export const INTEGRATION_DATABASE_URL = process.env.INTEGRATION_DATABASE_URL;

export const hasIntegrationDatabase = Boolean(INTEGRATION_DATABASE_URL);

/** Runs the suite only when a disposable database was provided. */
export const describeIntegration = hasIntegrationDatabase ? describe : describe.skip;

export function createIntegrationDatabase(): Sequelize {
  if (!INTEGRATION_DATABASE_URL) {
    throw new Error('INTEGRATION_DATABASE_URL is required for integration tests');
  }
  return new Sequelize(INTEGRATION_DATABASE_URL, {
    dialect: 'postgres',
    logging: false,
    pool: { max: 5, min: 0, idle: 1_000, acquire: 10_000 },
  });
}

/** Removes every row the suite created, leaving the schema in place. */
export async function truncateAll(database: Sequelize): Promise<void> {
  await database.query(`
TRUNCATE TABLE
  audit.audit_log,
  intelligence.claim_cluster_member,
  intelligence.document_cluster,
  intelligence.entity_mention,
  intelligence.claim_evidence,
  intelligence.data_contradiction,
  intelligence.review_task,
  intelligence.fact_claim,
  intelligence.raw_observation,
  intelligence.agent_run,
  intelligence.ai_agent,
  intelligence.entity_alias,
  intelligence.economic_entity
RESTART IDENTITY CASCADE;
  `);
}
