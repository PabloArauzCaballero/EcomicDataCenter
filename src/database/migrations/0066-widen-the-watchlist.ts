import { termMonthView, termView } from '../migration-sql/0066-widen-the-watchlist.view';
import type { MigrationContext } from '../migration.types';

/**
 * Reads the archive with two hundred subjects instead of thirty-six, and reads
 * it as a calendar.
 *
 * The corpus holds thirty-eight thousand notes from eleven outlets across six
 * and a half years. The watchlist that interrogated it held thirty-six terms,
 * and what a reader saw was not the country's coverage but the six subjects the
 * observatory happened to name first: fuel, the dollar, credit, prices, the
 * blockade, exports. Cement, textiles, poultry, quinoa, chestnut, coffee,
 * airlines, telecoms, water, electricity, schooling, health, housing, tourism —
 * all of them are in the archive every week and none of them had a row. So was
 * the informal economy this observatory exists to describe, which had exactly
 * one term.
 *
 * Two hundred-odd terms in twenty families replace them. Each is a stem, not a
 * word: Spanish inflects and the archive spells every form. Each is anchored to
 * the start of a word, which is what stops `oro` from matching *ahorro* — the
 * same failure migration 0056 found in the subject vocabulary and that this
 * list had inherited. And the text is accent-stripped before matching, so one
 * pattern covers the two spellings an archive uses for the same word.
 *
 * `press_term_month` is the second half, and the one a reader asked for: the
 * same corpus by month. A subject with four hundred mentions spread over six
 * years and one with four hundred in a single month are different events, and
 * no total distinguishes them. Tone travels across as counts per month, so a
 * panel can show what a subject sounded like in the month it was loudest.
 *
 * The mention view is replaced in place rather than dropped: the materialised
 * copy from migration 0053 hangs off it, and dropping it would take the press
 * panels down until the next refresh. Nothing here is visible until that copy
 * is refreshed — `yarn press:refresh`, or the end of any boot load.
 *
 * It now reads `press_article_snapshot` rather than the view that builds it.
 * Matching two hundred subjects against a view that reassembles every note from
 * its evidence took over ten minutes; against the stored copy it is a scan. The
 * refresh order this depends on is the one both callers already use — the
 * article snapshot first, the mention snapshot after it.
 */

const dropMonthView = `DROP VIEW IF EXISTS read_models.press_term_month;`;

const grants = `
DO $$
DECLARE
  role_name text;
  view_name text;
BEGIN
  FOREACH role_name IN ARRAY ARRAY['backend_reader', 'backup_operator'] LOOP
    IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = role_name) THEN
      FOREACH view_name IN ARRAY ARRAY['press_term_mention', 'press_term_month'] LOOP
        EXECUTE format('GRANT SELECT ON read_models.%I TO %I', view_name, role_name);
      END LOOP;
    END IF;
  END LOOP;
END;
$$;
`;

export async function up({ context }: MigrationContext): Promise<void> {
  await context.sequelize.query(dropMonthView);
  await context.sequelize.query(termView);
  await context.sequelize.query(termMonthView);
  await context.sequelize.query(grants);
}

/**
 * The monthly reading goes; the widened watchlist stays.
 *
 * A view replaced in place has no earlier version to fall back to, and
 * recreating the thirty-six-term list here would mean maintaining two copies of
 * a vocabulary that is already superseded. Rolling back this step leaves the
 * wider list in place, which is a superset and breaks nothing that read the
 * narrower one.
 */
export async function down({ context }: MigrationContext): Promise<void> {
  await context.sequelize.query(dropMonthView);
}
