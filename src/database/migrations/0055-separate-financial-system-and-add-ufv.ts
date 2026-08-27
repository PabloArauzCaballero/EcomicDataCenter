import { annualView } from '../migration-sql/0055-separate-financial-system-and-add-ufv.view';
import type { MigrationContext } from '../migration.types';

/**
 * Gives the financial system its own sector and puts the UFV in the annual cuadre.
 *
 * Three things were true of this view at once and none of them was obvious to
 * a reader. Interest rates existed but sat in MONETARIO beside the money
 * aggregates, so nobody looking for the price of credit found it as a group.
 * The four bank indicators the observatory already carried sat in the same
 * place, so «is the banking system covered» had no answer either — not because
 * the figures were missing but because they were filed under a question about
 * money supply. And the UFV, the unit half the country's credit is written in,
 * could never appear here at all: the view admits annual frequency and the UFV
 * is published daily.
 *
 * So MONETARIO splits. What is left is money and its price — aggregates,
 * lending and deposit rates, spreads, the central bank's own balance. What
 * leaves is FINANCIERO: whether the banks are capitalised, whether the loans
 * that stopped paying are covered by provisions, what they earn, how
 * concentrated they are and how far they reach.
 *
 * SOCIAL widens at the same time, from a dozen headcounts to how people
 * actually live — child and maternal mortality, schooling, water, sanitation,
 * electricity, the poverty gap, who holds the income, homicides — and takes the
 * Human Development Index, which is the single figure most readers reach for
 * first.
 *
 * And INSTITUCIONAL is new, because nothing held the answer to whether the
 * rules hold: rule of law, regulatory quality, control of corruption,
 * government effectiveness, political stability, and the perception indices
 * that sit beside them. It is the nearest the observatory can get to «libertad
 * económica»; the licensed indices that carry that name are unreachable, and
 * pretending one of these is that index would be worse than the gap.
 *
 * The UFV joins as its own derivation rather than by relabelling the daily
 * readings. Two things are stated rather than hidden about it:
 *
 * - The annual point is the **last reading of the year**, not a mean of it. A
 *   unit whose whole purpose is to carry value forward has no meaningful
 *   average, and the closing value is the one a contract settles against.
 * - The year still running is labelled `YEAR_TO_DATE`, not `YEAR_END`. Its last
 *   reading is simply the most recent day, and calling that a year's close
 *   would invite a comparison against twenty-four real closes that it cannot
 *   honestly answer. `statistic` therefore carries three values, and nothing
 *   can average a closed year against a partial one or against a figure the
 *   compiler published as annual.
 * - Days after today are excluded. The bank publishes the UFV about two weeks
 *   ahead so contracts settling next week know the unit now, which is correct
 *   for the daily series and wrong here: a close made of days that have not
 *   happened is a projection wearing the clothes of a reading.
 *
 * Idempotent like the models before it: dropped before being recreated.
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
