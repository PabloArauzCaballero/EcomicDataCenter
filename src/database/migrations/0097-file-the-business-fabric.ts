import { annualView as annualViewBefore } from '../migration-sql/0082-file-the-departments-and-companies.view';
import {
  annualSnapshot,
  annualSnapshotIndexes,
  annualView,
  dropModels,
  grants,
} from '../migration-sql/0097-file-the-business-fabric.view';
import type { MigrationContext } from '../migration.types';

/**
 * Files the business fabric: how many firms Bolivia has, which ones are the
 * largest, and who owns them.
 *
 * Until now the observatory knew a handful of companies — the issuers of the
 * stock exchange, a hundred exporters, the firms a reputation monitor ranks —
 * and nothing about the other four hundred thousand. The commercial register
 * publishes its stock every year since 2008, broken down by legal form,
 * department and activity; the tax administration publishes every year the
 * hundred firms that pay the most and how its roll splits by category; a
 * private ranking publishes the revenue, profit and equity of the five
 * hundred largest; and banks and issuers publish who their shareholders are.
 * Six collectors bring those in, and the dashboard builds three pages on them.
 *
 * This migration does the one thing the seeds cannot: it tells the annual view
 * which rubro those series belong to, by prefix. Without it every one of them
 * falls into `OTROS` and the pages built on them see nothing — a reading that
 * never reaches a panel is not a delivery.
 *
 * Nothing is re-measured and no other series moves. The stored copy is rebuilt
 * empty as in 0082 and filled by the refresh that runs on startup.
 */

export async function up({ context }: MigrationContext): Promise<void> {
  await context.sequelize.query(dropModels);
  await context.sequelize.query(annualView);
  await context.sequelize.query(annualSnapshot);
  await context.sequelize.query(annualSnapshotIndexes);
  await context.sequelize.query(grants);
}

export async function down({ context }: MigrationContext): Promise<void> {
  await context.sequelize.query(dropModels);
  await context.sequelize.query(annualViewBefore);
  await context.sequelize.query(annualSnapshot);
  await context.sequelize.query(annualSnapshotIndexes);
  await context.sequelize.query(grants);
}
