import { filingView } from '../migration-sql/0061-file-filings-by-meaning.view';
import type { MigrationContext } from '../migration.types';

/**
 * Files each filing by what it says, not only by who said it.
 *
 * The register has been readable by issuer and by industry since 0038, and
 * that answers «which companies are filing». It does not answer «what are they
 * filing about», which is the question the report's Empresas tab exists to
 * ask. The only field carrying the answer is the subject line, and the subject
 * line is unusable as a category: nineteen thousand filings carry four
 * thousand distinct subjects, because the exchange lets each issuer word its
 * own — `DESIGNACIÓN DE EJECUTIVO`, `Nombramiento de Ejecutivo`, `EJECUTIVO
 * INTERINO` and `Designación temporal de nuevo ejecutivo por vacación del
 * titular` are one thing said four ways.
 *
 * So the subject is read for meaning, the way 0056 through 0060 read press
 * headlines: accents folded, matched against stems rather than whole phrases,
 * first rule wins. Eleven categories and a residual:
 *
 *   JUNTA           26.2%  what shareholders and members decided, and the
 *                          calls that convened them
 *   DIRECTORIO      22.8%  what the board, management and the committees
 *                          resolved between those meetings
 *   EMISION         16.1%  securitisation patrimonies, bond issues, listings,
 *                          and the servicing events they generate
 *   EJECUTIVOS      15.5%  who took a post, left one, or stood in
 *   FINANCIAMIENTO   6.8%  loans taken, disbursed, guaranteed or covenanted
 *   CALIFICACION     3.3%  what a rating agency said about the issuer
 *   CAPITAL          2.8%  dividends, share transfers, capital changes
 *   PODERES          2.4%  powers of attorney granted and revoked
 *   OPERACIONES      1.1%  contracts, acquisitions, plants, incidents
 *   REGULATORIO      0.4%  the supervisor's acts and the issuer's response
 *   ESTADOS          0.2%  financial statements and their audit
 *   OTROS            2.5%  382 subjects that genuinely share nothing
 *
 * Order carries the meaning where a subject could belong to two. A rating
 * agency's report on a securitisation patrimony is a rating, so CALIFICACION
 * is tested first. `Determinaciones del Comité de Inversión` is a committee
 * acting for a fund, which is an EMISION matter rather than a board one, so
 * EMISION precedes DIRECTORIO. And `Convocatoria a Junta` names a meeting
 * being called, not the executives who will attend, so EJECUTIVOS is tested
 * before JUNTA only for the stems that name a person's post.
 *
 * What stays under «Otros» is 2.5% across 382 distinct subjects — the tail of
 * a register where every issuer writes its own subject line. Pushing it lower
 * would mean assigning categories to filings whose subject states no category.
 *
 * `sector` is untouched: the industry expression is 0040's, to the character.
 * The category is appended as a column, so the view is replaced in place and
 * every reader that named its columns keeps working.
 */

const grants = `
DO $$
DECLARE
  role_name text;
BEGIN
  FOREACH role_name IN ARRAY ARRAY['backend_reader', 'backup_operator'] LOOP
    IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = role_name) THEN
      EXECUTE format('GRANT SELECT ON read_models.company_filing TO %I', role_name);
    END IF;
  END LOOP;
END;
$$;
`;

export async function up({ context }: MigrationContext): Promise<void> {
  await context.sequelize.query(filingView);
  await context.sequelize.query(grants);
}

/** A view replaced in place has no earlier version to fall back to. */
export async function down(): Promise<void> {
  return Promise.resolve();
}
