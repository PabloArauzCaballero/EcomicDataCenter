import {
  companySocialIndex,
  companySocialPostView,
  companySocialProfileView,
  companySocialTermView,
  dropCompanySocialViews,
  grants,
} from '../migration-sql/0094-read-the-company-social-accounts.view';
import type { MigrationContext } from '../migration.types';

/**
 * Opens the official social accounts of the Merco companies for reading
 * (ADR 0027): profiles, posts and frequent terms, each in a view of its own.
 *
 * Kept out of the indicator views on purpose. A follower count a platform
 * declares about an account is not a series of the country, and the seeder
 * writes these observations without a `measures` array so that no indicator
 * view ever picks them up.
 */

export async function up({ context }: MigrationContext): Promise<void> {
  await context.sequelize.query(dropCompanySocialViews);
  await context.sequelize.query(companySocialProfileView);
  await context.sequelize.query(companySocialPostView);
  await context.sequelize.query(companySocialTermView);
  await context.sequelize.query(companySocialIndex);
  await context.sequelize.query(grants);
}

export async function down({ context }: MigrationContext): Promise<void> {
  await context.sequelize.query(dropCompanySocialViews);
  await context.sequelize.query(
    'DROP INDEX IF EXISTS intelligence.ix_raw_observation_company_social;',
  );
}
