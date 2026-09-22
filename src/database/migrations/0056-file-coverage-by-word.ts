import { articleView } from '../migration-sql/0056-file-coverage-by-word.view';
import type { MigrationContext } from '../migration.types';

/**
 * Files coverage by whole words instead of by loose substrings.
 *
 * Every step since 0046 widened the vocabulary and none of them changed how a
 * word is looked for: `subject ILIKE '%via %'`. That pattern does not mean
 * "the word vía"; it means "the letters v-i-a followed by a space", and the
 * corpus is about **Boli**via. One thousand seven hundred and fifty-nine notes
 * — one in twenty-two of everything held — were filed as infrastructure
 * because they named the country. The same accident put 545 under fiscal
 * policy for `'%iva %'` inside *iniciativa*, 602 under energy for `'%ende%'`
 * inside *defiende*, 186 under the real economy for `'%oro %'` inside *foro*,
 * and 50 under corporate life for `'%tigo%'` inside *testigo*. Close to four
 * thousand notes carried a subject that no reader of the headline would agree
 * with, which is the version of "the analytics is wrong" a client can see
 * without knowing any SQL.
 *
 * So the matching changes shape. `~ ANY` with `\\m` anchors each term to the
 * start of a word, and the subject is folded once — lowered and stripped of
 * accents — so a single stem covers every spelling the archive holds. The
 * headlines were rebuilt from URL slugs and arrive both with and without
 * accents; matching on the folded form is what makes `inflación` and
 * `inflacion` one rule rather than two, and it is why the terms below are
 * written unaccented.
 *
 * Stems, not words, close the other half of the gap. Spanish inflects, and a
 * list holding `exportación` misses *exportar*; `empleo` misses *empleado*;
 * `minería` misses *mina*; `presupuesto` misses *presupuestaria*; `ministro`
 * misses *ministra* and *ministerial*. That is most of what the residual
 * actually held: economic coverage that the lexicon could nearly, but not
 * quite, read. «Otros» falls from 13.1% to 8.5% of the corpus, and what
 * remains there is culture, sport, obituaries and opinion — coverage that
 * genuinely carries no economic subject.
 *
 * Two subjects were starved by precedence rather than by vocabulary. Crime
 * and weather were tested last, so a robbery in a *mercado* was filed as
 * foreign trade and a frost over *hectáreas* as the real economy. Both now
 * run before the broad catch-alls, which is the order a reader expects: the
 * distinctive subject wins over the general one.
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
