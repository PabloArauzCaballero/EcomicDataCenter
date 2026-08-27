import { articleView } from '../migration-sql/0054-file-climate-and-fix-gender.view';
import type { MigrationContext } from '../migration.types';

/**
 * Files what the weather does to the economy, and fixes a gender ending.
 *
 * `económico` was in the activity list and `económica` was not, so every
 * headline about «la crisis económica» — sixty-two of them in the residual
 * alone — was unfiled on a vowel. That is the same class of mistake as
 * `salario` missing "salarial": Spanish inflects, and a list that matches one
 * form matches half the coverage.
 *
 * Fire, drought, flood, hail and frost get a subject of their own. In Bolivia
 * they are not weather stories: a chaqueo season closes roads and a drought
 * decides a soya harvest, and both reach the price of food weeks later. Filing
 * them as "other subjects" hid a driver an economist reading this report is
 * looking for.
 *
 * Vehicles join the real economy and company directors join corporate life,
 * both from the same count of what the residual still held.
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
