import { annualView } from '../migration-sql/0064-file-the-fiscal-accounts.view';
import type { MigrationContext } from '../migration.types';

/**
 * Gives the state's own accounts a sector, and a second compiler a place to sit.
 *
 * Two gaps closed at once, and they are the same gap seen from two sides.
 *
 * The first: every annual figure in this observatory came from one compiler.
 * That reads as agreement when it is really a single method — one house's
 * revisions, its country coverage, its blind spots — repeated across a hundred
 * and fifty series. The Fund publishes Bolivia too, and now sits beside it. The
 * duplicated series are duplicated deliberately: two estimates of the same year
 * are the only honest way to show how wide the uncertainty around it is, and
 * they are filed under their own codes so neither can quietly overwrite the
 * other. Trade joins them from the United Nations register, which counts goods
 * at the frontier where the balance of payments estimates ownership — a
 * different measurement of the same year, not a correction of it.
 *
 * The second: `FISCAL` existed in this view once and was emptied by migration
 * 0037, which moved every debt series to `DEUDA` and left nothing behind. So
 * the observatory could say what the country owed and never what it collected
 * or spent, and a reader asking whether the state lives within its means had no
 * sector to open. Revenue, expenditure, the overall balance and the primary
 * balance restore it, and gross and net public debt join the sector where the
 * rest of the debt already lives rather than splitting it in two.
 *
 * Nothing existing is refiled. The new codes are new rows in the same CASE, so
 * every series already classified keeps the sector it had, and the view is
 * dropped and recreated like the models before it.
 */

const dropView = `DROP VIEW IF EXISTS read_models.macro_indicator_annual;`;

const grants = `
DO $$
DECLARE
  role_name text;
BEGIN
  FOREACH role_name IN ARRAY ARRAY['backend_reader', 'backup_operator'] LOOP
    IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = role_name) THEN
      EXECUTE format('GRANT SELECT ON read_models.macro_indicator_annual TO %I', role_name);
    END IF;
  END LOOP;
END;
$$;
`;

export async function up({ context }: MigrationContext): Promise<void> {
  await context.sequelize.query(dropView);
  await context.sequelize.query(annualView);
  await context.sequelize.query(grants);
}

export async function down({ context }: MigrationContext): Promise<void> {
  await context.sequelize.query(dropView);
}
