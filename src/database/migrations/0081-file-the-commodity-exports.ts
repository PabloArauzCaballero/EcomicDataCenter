import { annualView as annualViewBefore } from '../migration-sql/0080-file-the-freedom-indices.view';
import {
  annualSnapshot,
  annualSnapshotIndexes,
  annualView,
  dropModels,
  grants,
} from '../migration-sql/0081-file-the-commodity-exports.view';
import type { MigrationContext } from '../migration.types';

/**
 * Files the exported commodities under «Recursos».
 *
 * The observatory could say that mineral rents were 5,91 % of GDP and that
 * minerals and metals were 43,6 % of what the country sells. It could not say
 * how much zinc, how much gold, or — the question that has no answer anywhere
 * in the corpus — how much lithium. The rents are a share of output that does
 * not separate one mineral from another and closes in 2021; the trade total
 * does not separate products at all.
 *
 * The new collector brings the customs declaration line by line: fifteen
 * tariff lines from 1992 to last year, each in dollars and in net kilos,
 * because the dollar value of an export mixes price with volume and only the
 * weight answers how much is coming out of the ground. Lithium carbonate is in
 * there under 2836.91, which the Harmonised System files among chemicals and
 * not among minerals — the reason a mining report can have no lithium figure
 * in it.
 *
 * This migration does the one thing the seed cannot: it tells the annual view
 * which rubro those series belong to. Without it every one of them falls into
 * the residual and the chapter built on «Recursos» does not see them, which is
 * the same way a reading that never reaches a panel is not a delivery.
 *
 * Nothing is re-measured and no other series moves. The stored copy is rebuilt
 * empty as in 0077 and filled by the refresh that runs on startup.
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
