import { articleView } from '../migration-sql/0059-file-the-last-residual.view';
import type { MigrationContext } from '../migration.types';

/**
 * Takes «Otros» to one per cent, by asking broad words only what they can answer.
 *
 * 0058 left the residual at 3.3% and stopped there on the argument that the
 * rest could only be closed with generic words, and that generic words are how
 * the original defect read: `pago` placed among the monetary terms claimed 495
 * notes whose plain sense is labour («ya pagó el aguinaldo») or the real
 * economy («lecheros demandan pago»). That argument was about *placement*, not
 * about the words. A broad word inside a family competes with the specific
 * rules and beats them whenever it is tested first. The same word after every
 * specific rule competes with nothing: it is reached only by a headline that
 * no precise rule recognised, and there it is not stealing a better answer —
 * it is the only answer on offer.
 *
 * So the vocabulary gains a final tier, written after the whole existing chain
 * and marked as such in the SQL. `sector`, `proyecto`, `informe`, `cuenta`,
 * `persona`, `estado` file what is left. No family loses a note to them: the
 * only counts that move are upwards, and they sum to exactly what the residual
 * gives up — 877 notes, so «Otros» falls from 1,284 to 407, or 1.06% of the
 * corpus. The families whose vocabulary is already precise do not move at all:
 * HIDROCARBUROS still holds 4,886, FISCAL 3,071, COMERCIO_EXTERIOR 2,020,
 * PRECIOS 1,510, CAMBIARIO 1,491 and EMPRESARIAL 484, to the note.
 *
 * What this buys and what it costs, plainly. It buys a register where a reader
 * meets «Otros» once in a hundred notes instead of once in thirty, and where
 * 877 headlines that carried no subject now carry the most defensible one
 * their words support. It costs certainty on exactly those 877: a note filed
 * here is filed on a weak signal, and some are arguable — a forensic institute
 * confirming a death now reads as crime because that is the nearest sense of
 * the words it uses. The trade is confined to notes that were previously
 * unfiled, so no reader loses an answer they had before.
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
