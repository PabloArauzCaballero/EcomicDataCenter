import type { MigrationContext } from '../migration.types';

/**
 * Keeps a materialised copy of the social reading register, and indexes it.
 *
 * The register is small today — a few dozen readings — and a snapshot for that
 * would be premature on cost alone. It is created now for a different reason:
 * the press models learned the shape the hard way, at thirty-eight thousand
 * rows and nine seconds a page, and adding the snapshot after a consumer is
 * already reading the view means changing what that consumer reads. Here the
 * register and its snapshot arrive together, so the report never has to move.
 *
 * The view stays the definition. It is what a reader reads to know why a
 * reading was filed under BURLA rather than INDIGNACION.
 *
 * `REFRESH ... CONCURRENTLY` needs a unique index, which the claim id provides.
 * The catalogue is loaded by seeds and grows only when somebody registers a new
 * publication, so refreshing at the end of a load is the right moment.
 *
 * See docs/decisions/0022-social-readings-never-measure.md.
 */

const snapshot = `
CREATE MATERIALIZED VIEW IF NOT EXISTS read_models.social_reading_snapshot AS
  SELECT * FROM read_models.social_reading;
`;

const indexes = `
CREATE UNIQUE INDEX IF NOT EXISTS ux_social_reading_snapshot_claim
  ON read_models.social_reading_snapshot (fact_claim_id);
CREATE INDEX IF NOT EXISTS ix_social_reading_snapshot_date
  ON read_models.social_reading_snapshot (event_date DESC, published_at DESC);
CREATE INDEX IF NOT EXISTS ix_social_reading_snapshot_platform
  ON read_models.social_reading_snapshot (platform);
CREATE INDEX IF NOT EXISTS ix_social_reading_snapshot_subject
  ON read_models.social_reading_snapshot (subject);
CREATE INDEX IF NOT EXISTS ix_social_reading_snapshot_metric
  ON read_models.social_reading_snapshot (metric);
CREATE INDEX IF NOT EXISTS ix_social_reading_snapshot_grade
  ON read_models.social_reading_snapshot (evidence_grade);
CREATE INDEX IF NOT EXISTS ix_social_reading_snapshot_register
  ON read_models.social_reading_snapshot (emotional_register);
CREATE INDEX IF NOT EXISTS ix_social_reading_snapshot_counterpart
  ON read_models.social_reading_snapshot (official_counterpart);
`;

const grants = `
DO $$
DECLARE
  role_name text;
BEGIN
  FOREACH role_name IN ARRAY ARRAY['backend_reader', 'backup_operator'] LOOP
    IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = role_name) THEN
      EXECUTE format(
        'GRANT SELECT ON read_models.social_reading_snapshot TO %I', role_name);
    END IF;
  END LOOP;
END;
$$;
`;

export async function up({ context }: MigrationContext): Promise<void> {
  await context.sequelize.query(snapshot);
  await context.sequelize.query(indexes);
  await context.sequelize.query(grants);
}

export async function down({ context }: MigrationContext): Promise<void> {
  await context.sequelize.query(
    `DROP MATERIALIZED VIEW IF EXISTS read_models.social_reading_snapshot;`,
  );
}
