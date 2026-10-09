import { createAbiNews, dropAbiNews } from '../migration-sql/0100-read-abi-company-news.view';
import type { MigrationContext } from '../migration.types';

export async function up({ context }: MigrationContext): Promise<void> {
  await context.sequelize.query(createAbiNews);
}
export async function down({ context }: MigrationContext): Promise<void> {
  await context.sequelize.query(dropAbiNews);
}
