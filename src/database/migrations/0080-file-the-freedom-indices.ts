import { annualView as annualViewBefore } from '../migration-sql/0077-return-the-panel-and-widen-the-vocabulary.view';
import {
  annualSnapshot,
  annualSnapshotIndexes,
  annualView,
  dropModels,
  grants,
} from '../migration-sql/0080-file-the-freedom-indices.view';
import type { MigrationContext } from '../migration.types';

/**
 * Files the freedom and democracy indices under «Instituciones».
 *
 * The observatory rated the country's institutions with six governance
 * estimates, two V-Dem indices, a corruption survey and a regime label, and
 * the reader who asked for the *legal and political situation* found no
 * answer to the question they actually had: how free is the country, in what
 * sense, and which part of that freedom moved. Three publishers answer it
 * with composites built from named parts — Freedom House's political rights
 * and civil liberties and the seven subcategories under them, the Fraser
 * Institute's economic freedom summary and its five areas, and the rest of
 * V-Dem's democracy family beside the two indices already here.
 *
 * The collectors bring twenty-five new series into the composite-index seed.
 * This migration does the one thing the seed cannot: it tells the annual view
 * which rubro they belong to. Without it every one of them would fall into
 * the residual and the section built on «Instituciones» would not see them —
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
