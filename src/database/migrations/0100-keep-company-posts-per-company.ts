import { companySocialPostView } from '../migration-sql/0094-read-the-company-social-accounts.view';
import type { MigrationContext } from '../migration.types';

/** A platform post ID can occur in more than one company record. */
export async function up({ context }: MigrationContext): Promise<void> {
  await context.sequelize.query(companySocialPostView);
}

export async function down({ context }: MigrationContext): Promise<void> {
  const previousView = companySocialPostView
    .replace("SELECT DISTINCT ON (post ->> 'slug', ", 'SELECT DISTINCT ON (')
    .replace("ORDER BY\n  post ->> 'slug',\n", 'ORDER BY\n');
  await context.sequelize.query(previousView);
}
