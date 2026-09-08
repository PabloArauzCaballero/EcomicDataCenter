import { articleView } from '../migration-sql/0071-widen-the-coverage-lexicon.view';
import type { MigrationContext } from '../migration.types';

/**
 * Triples the vocabulary the register reads coverage with, and empties the two
 * boxes a reader cannot use: «sin marca» and «otros temas».
 *
 * 0060 left the tone at 15.2% «sin marca» and argued that what remained valued
 * nothing. Reading the residual says otherwise. A headline where the aduana
 * **destruye** 196 tonnes of contraband, where a port **cesa** operations for
 * drought, where a bank **renuncia** its whole board, where a company
 * **facturó** 4,520 million — each states something a reader weighs, and each
 * was filed as stating nothing, because the lists held `informa` but not
 * `informó`, `crea` but not `creó`, `entrega` but not `entregaron`. The same
 * defect ran through the subjects: 0059 closed «Otros» to 1.06% with six broad
 * words, and the 408 notes still left there were not broad at all — they were
 * specific about subjects the lists had never named. Mining seams, school
 * calendars, telecom spectrum, retail weeks, opinion columns, food, festivals.
 *
 * So both lexicons grow, and they grow by naming things rather than by
 * loosening rules. 2,121 new terms across the twenty-two subjects and 1,416
 * across the nine tones — 5,993 in all, from 2,456. The additions are stems
 * and named things: `gasoducto`, `regasific`, `cisternero` for hydrocarbons;
 * `ufv`, `pignor`, `tasa referencial` for the monetary family; `desaguadero`,
 * `tambo quemado`, `certificado de origen` for foreign trade; `bachiller`,
 * `posgrado`, `oncolog` for the social one; `alerta hidrologica`,
 * `credito de carbono`, `cazador furtiv` for climate. Nothing is reclassified
 * by fiat: every term is tested in the place its plain sense belongs, and the
 * last-resort tier 0059 opened stays last.
 *
 * The result on the corpus of 38,369 notes. «Sin marca» falls from 15.20% to
 * 7.03%, and «Otros temas» from 1.06% to 0.10% — 40 notes, nearly all of them
 * archive fragments with no sentence left in them («Viviana coloma de solydes
 * 15x10.jpeg»). No family is emptied to fill another: the subjects move by
 * degrees rather than by reshuffling, HIDROCARBUROS 12.71% to 13.60%,
 * SECTOR_REAL 14.64% to 12.95% as mining, telecom and retail terms let more
 * precise families claim what was theirs, FISCAL 8.01% to 9.08%, CULTURA 0.90%
 * to 1.35%. Among tones the 8.2 points released by «sin marca» land where the
 * words point: MEDIDA 20.85% to 24.06%, MEJORA 14.02% to 15.61%, ALARMA
 * 12.93% to 14.07%, CONFLICTO 10.71% to 12.15%.
 *
 * What it costs. DECLARACION drops from 1,283 notes to 903, because an
 * attribution that also carries a direction is now read for the direction —
 * «el ministro acusa» is conflict before it is a claim, «los empresarios ven
 * avances» is expectation before it is a quote. That is the order 0060 set and
 * this step keeps; the pure attributions still land there. And the 2,697 notes
 * left under «sin marca» are the real floor: a quoted exchange rate, a company
 * address, a schedule, a list of names.
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
