import {
  dropAdded,
  expensiveSnapshots,
  snapshotIndexes,
  snapshotState,
  sourceNoteView,
} from '../migration-sql/0072-snapshot-the-expensive-read-models.view';
import type { MigrationContext } from '../migration.types';

/**
 * Stores the output of the four read models that stopped answering in time.
 *
 * Every figure in the observatory is derived from `economic_indicator_reading`,
 * which reassembles each reading by exploding the `measures` array of every raw
 * observation. At the scale of a demonstration corpus that was free. At a
 * million and a half observations it is a full scan and a JSON explosion per
 * query, and four of the report's reads no longer finish: the source register,
 * the annual macro series, the filings and the world panel catalogue. Three are
 * cancelled by the statement ceiling; the fourth has already come back 53100,
 * the server out of room for the sort it needed. The other ten reads answer in
 * under a second and the page cannot show them, because until now one slow view
 * took the whole briefing down with it.
 *
 * This is the shape migration 0053 already gave the press models, for the same
 * reason and with the same reservation. The views stay untouched: they remain
 * the definition, the thing to read to know how a figure was derived. What is
 * added is their output with the indexes a register needs. The corpus is
 * append-only and grows when a collector runs or a seed is loaded, so a stored
 * copy is the right shape for it — refreshed at the end of a load, never during
 * one.
 *
 * Migration 0068 argued the opposite for the panel catalogue and un-materialised
 * it: measured, the grouping answered in 460 ms, and half a second is a page
 * load while a snapshot is a refresh to forget. That measurement was taken
 * against the Neon database the observatory used to live on. On the server it
 * lives on now the same view runs out of disk, so the measurement no longer
 * describes the machine. The reasoning in 0068 is kept, not overruled: it says
 * to materialise only what is measured to need it, which is what this does.
 *
 * The snapshots are created `WITH NO DATA`. Building them here would put
 * minutes of sorting between a deploy and an API that can start — the `api`
 * service waits on `migrate` completing — on a server that has already refused
 * one of these queries for want of space. Empty they cost nothing, and the
 * refresh that fills them is a separate step that can fail without holding the
 * core down. `read_models.snapshot_state` reports which have been built, so a
 * reader can tell «nobody has filled this yet» from «there is nothing in it».
 */

const grants = `
DO $$
DECLARE
  role_name text;
  model_name text;
BEGIN
  FOREACH role_name IN ARRAY ARRAY['backend_reader', 'backup_operator'] LOOP
    IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = role_name) THEN
      FOREACH model_name IN ARRAY ARRAY[
        'indicator_source_note',
        'indicator_source_note_snapshot',
        'macro_indicator_annual_snapshot',
        'company_filing_snapshot',
        'world_panel_catalogue_snapshot',
        'snapshot_state'
      ] LOOP
        EXECUTE format('GRANT SELECT ON read_models.%I TO %I', model_name, role_name);
      END LOOP;
    END IF;
  END LOOP;
END;
$$;
`;

export async function up({ context }: MigrationContext): Promise<void> {
  // Idempotente por si un intento anterior dejo la mitad: crear una vista que
  // ya existe aborta la migracion entera y bloquea el arranque de la API.
  await context.sequelize.query(dropAdded);
  await context.sequelize.query(sourceNoteView);
  await context.sequelize.query(expensiveSnapshots);
  await context.sequelize.query(snapshotIndexes);
  await context.sequelize.query(snapshotState);
  await context.sequelize.query(grants);
}

export async function down({ context }: MigrationContext): Promise<void> {
  await context.sequelize.query(dropAdded);
}
