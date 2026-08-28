import { articleView } from '../migration-sql/0058-widen-coverage-vocabulary.view';
import type { MigrationContext } from '../migration.types';

/**
 * Names five more subjects, and stops calling a valued headline unmarked.
 *
 * 0056 fixed how a word is looked for. What it did not fix is how much of the
 * country's coverage the vocabulary had ever been asked to describe: one note
 * in twelve still landed in «Otros», and two in five carried no tone at all.
 * Neither number is a property of the corpus. Both were a property of the list.
 *
 * Most of the residual was economic coverage the lexicon could nearly read.
 * Spanish inflects and the list held one form of each word: `exportación`
 * without *exportar*, `turístico` without *turistas*, `emprendimiento`
 * without *emprender*, `recuperación` without *recuperaron*. Whole industries
 * had no term at all — no rating agency, no insurer, no airline, no brewery,
 * no telecoms operator, no ferry, no seed company. Those are added as stems,
 * so one entry covers every form the archive spells.
 *
 * The rest was coverage that is genuinely not about the economy, and the
 * honest fix there is not to force it into an economic subject but to name
 * what it is. Five subjects join: JUDICIAL for the courts, DEPORTES for
 * sport, CULTURA for what a country reads and celebrates, INTERNACIONAL for
 * what happens elsewhere, and — already present — CRONICA_ROJA and CLIMA keep
 * their precedence ahead of the broad economic blocks. «Otros» falls from
 * 8.5% to 3.3% and now holds what it says: coverage with no subject this
 * observatory tracks.
 *
 * Tone was starved the same way. The lists were built from a handful of verbs
 * and Spanish has a hundred: a headline saying a figure *recuperó*, that a
 * bank *limita*, that a ministry *releva*, that a company *pretende* was filed
 * as unmarked because the exact conjugation was missing. Stems replace the
 * conjugations and NEUTRO falls from 43.8% to 20.9%. What stays there is
 * reporting that really states a fact without valuing it, which is a real
 * category and not a gap.
 *
 * Two things this deliberately does not do. It does not add generic words —
 * `pago`, `caso`, `estado`, `persona` were tried and rejected: `pago` alone
 * sent 495 notes to MONETARIO, of which the plain reading is labour («ya pagó
 * el aguinaldo») or the real economy («lecheros demandan pago»). Filing by a
 * word that every subject uses is how 0056's bug was born, and a lower
 * residual bought that way is worse than a higher honest one. And it does not
 * reach 1%: closing the last two points would mean a rule per headline, which
 * fits this corpus and fails the next collection.
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
