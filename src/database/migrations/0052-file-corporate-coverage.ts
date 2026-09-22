import { articleView } from '../migration-sql/0052-file-corporate-coverage.view';
import type { MigrationContext } from '../migration.types';

/**
 * Files corporate life, which was the largest thing «Otros» still held.
 *
 * A hotel modernising its lobby, a telecoms group naming a chief executive, a
 * bank taking an award, a construction firm at the edge of bankruptcy: these
 * are companies doing what companies do, and an observatory of the economy has
 * no business calling them unclassifiable. The subject list was built out of
 * commodities, instruments and policy, and had no room for the firms
 * themselves.
 *
 * It sits ahead of politics and after every commodity and instrument, so a bank
 * story about interest rates stays monetary and a company story about diésel
 * stays fuel. Only coverage that is about the company as a company lands here.
 *
 * Three subjects grow with what the count showed alongside it: the tax
 * vocabulary an accountant uses (IUE, IVA, patentes, contribuyentes), the
 * education and childhood vocabulary that belongs to the social accounts, and
 * bus terminals and passengers, which belong to public works.
 *
 * The residual matters more than it looks. An economist reading that a third of
 * the coverage could not be classified concludes the classification is broken —
 * and at that size they are right to. What is left under «Otros» should be what
 * genuinely has no economic subject, not what the list forgot to name.
 */

const grants = `
DO $$
DECLARE
  role_name text;
BEGIN
  FOREACH role_name IN ARRAY ARRAY['backend_reader', 'backup_operator'] LOOP
    IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = role_name) THEN
      EXECUTE format('GRANT SELECT ON read_models.press_article TO %I', role_name);
    END IF;
  END LOOP;
END;
$$;
`;

export async function up({ context }: MigrationContext): Promise<void> {
  await context.sequelize.query(articleView);
  await context.sequelize.query(grants);
}

/** A view replaced in place has no earlier version to fall back to. */
export async function down(): Promise<void> {
  return Promise.resolve();
}
