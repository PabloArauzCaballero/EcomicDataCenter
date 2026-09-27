import { annualView as annualViewBefore } from '../migration-sql/0081-file-the-commodity-exports.view';
import {
  annualSnapshot,
  annualSnapshotIndexes,
  annualView,
  dropModels,
  grants,
} from '../migration-sql/0082-file-the-departments-and-companies.view';
import type { MigrationContext } from '../migration.types';

/**
 * Files Bolivia by department, and the firms that sell it abroad.
 *
 * The observatory measured one country. Every annual series in it — output,
 * exports, the rents of the subsoil — is a single number a year for nine
 * departments at once, and that number cannot answer the question anyone asks
 * first, which is where. Tarija losing the gas and La Paz gaining the gold are
 * opposite halves of the same decade, and in the national figure they cancel
 * into something that looks like calm.
 *
 * Three new collectors bring what was missing. The INE publishes departmental
 * national accounts as cross-tabs — six measures for the nine departments and
 * for the country, 1988 to 2024 — and departmental trade as a nested table:
 * what each department sells abroad, product by product, in dollars and in
 * tonnes, from 2010. That is around two hundred series where the corpus had
 * none below the national level.
 *
 * The third answers a question the state does not: which firms export the
 * most. Bolivia publishes no such figure — the INE reaches product, department
 * and destination; customs publishes aggregates; the mining yearbook separates
 * state, private and cooperative producers but never a company — because the
 * individual customs declaration is confidential. What exists is a commercial
 * aggregator's ranking, and its total does not reconcile with the INE's, so
 * what this migration files is the **order and the share** and not the
 * dollars. The dollars stay in the excerpt kept as evidence, because the
 * excerpt is what the source said and the series is what the observatory is
 * willing to assert. Beside it goes Merco's reputation monitor, which is a
 * measurement with a declared method, so that the two can be read against each
 * other: eight of the hundred largest exporters appear in it, and that scarcity
 * is the point.
 *
 * This migration does the one thing the seed cannot: it tells the annual view
 * which rubro those series belong to. Without it every one of them falls into
 * the residual and the chapters built on them do not see the rows — the same
 * way a reading that never reaches a panel is not a delivery.
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
