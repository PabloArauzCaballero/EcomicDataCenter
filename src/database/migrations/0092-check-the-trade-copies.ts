import {
  dropTradeCopiesCheck,
  tradeCopiesCheck,
  tradeCopiesCheckGrants,
} from '../migration-sql/0092-check-the-trade-copies.view';
import type { MigrationContext } from '../migration.types';

/**
 * Lets the database say whether the three trade copies are up to date.
 *
 * The customs base stayed invisible on test for a day with every block loaded:
 * its copies had been built empty and nothing in the system could tell a copy
 * that is empty from one that is current. The function reads the answer from the
 * data; the boot loader and the API both ask it (see `trade-copies-currency.ts`).
 */
export async function up({ context }: MigrationContext): Promise<void> {
  await context.sequelize.query(dropTradeCopiesCheck);
  await context.sequelize.query(tradeCopiesCheck);
  await context.sequelize.query(tradeCopiesCheckGrants);
}

export async function down({ context }: MigrationContext): Promise<void> {
  await context.sequelize.query(dropTradeCopiesCheck);
}
