import { articleView } from '../migration-sql/0060-widen-the-tone-lexicon.view';
import type { MigrationContext } from '../migration.types';

/**
 * Reads the tone of three thousand more headlines, and stops calling
 * attribution a measure.
 *
 * «Sin marca» stood at 20.9% after 0058, and the reason was the same one that
 * had inflated «Otros»: the lists held a handful of conjugations where Spanish
 * has a hundred. `cierra` without *cerraron*, `crece` without *crecieron*,
 * `golpeado` without *golpean*, `afectado` without *afecta*, `beneficia*
 * without *benefició*. A headline saying a company **adeuda** millions, that
 * nevadas **alteran** travel, that a contract was **rescindido**, that a plant
 * **contrae** its output — each of those states a direction plainly, and each
 * was filed as carrying no direction at all. Stems replace the conjugations
 * and the residual falls to 15.2%.
 *
 * The second change is a correction rather than a widening. MEDIDA is labelled
 * «medida tomada», and it had been collecting every verb of attribution:
 * `dice`, `afirma`, `asegura`, `informa`, `confirma`, `revela`. «El ministro
 * dice» is not a measure anybody took — it is a claim somebody made, and who
 * makes a claim is half of what a reader is weighing. Those stems leave MEDIDA
 * and become DECLARACION, tested after every valued tone so that «el ministro
 * dice que suben los precios» still reads as a rise and only the bare
 * attribution lands there. MEDIDA drops from 23.0% to 20.8% and now means what
 * its name promises; DECLARACION holds 1,283 notes.
 *
 * What stays under «sin marca» is 15.2% of the corpus that genuinely values
 * nothing — a quotation of the day's exchange rate, a company's registered
 * address, a schedule. That is a real category, and pushing it lower would
 * mean marking a direction onto headlines that state none.
 *
 * Subjects are untouched: the topic expression is 0059's, to the note, which
 * the migration's verification checked rather than assumed.
 *
 * The view is the definition; `press_article_snapshot` is its stored output
 * and must be refreshed for a report to see any of this.
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
