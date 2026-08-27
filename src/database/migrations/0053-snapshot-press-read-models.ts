import type { MigrationContext } from '../migration.types';

/**
 * Keeps a materialised copy of the press read models, and indexes it.
 *
 * `press_article` reassembles every claim from its raw observation, its source
 * artifact and its evidence, and applies the whole subject and tone lexicon on
 * top. At four thousand notes that was free. At thirty-eight thousand it is
 * nine seconds per query, twelve to scan it whole, and a landing page that
 * exceeded the statement timeout — the report stopped answering.
 *
 * The view stays exactly as it is: it remains the definition, the thing a
 * reader can read to know how a note was filed. What is added is a snapshot of
 * its output with the indexes a register needs — by date to page it, by each
 * dimension to slice it. Nothing about how the figures are derived changes;
 * only how often the derivation is paid for.
 *
 * The corpus is immutable and grows only when a collector runs and the seeds
 * are loaded, so a snapshot is the right shape for it: refreshed at the end of
 * a load, never during one. `REFRESH ... CONCURRENTLY` needs a unique index,
 * which the claim id provides, so a refresh does not lock out readers.
 *
 * See docs/decisions/0020-materialise-press-read-models.md.
 */

const snapshots = `
CREATE MATERIALIZED VIEW IF NOT EXISTS read_models.press_article_snapshot AS
  SELECT * FROM read_models.press_article;

CREATE MATERIALIZED VIEW IF NOT EXISTS read_models.press_term_mention_snapshot AS
  SELECT * FROM read_models.press_term_mention;
`;

const indexes = `
CREATE UNIQUE INDEX IF NOT EXISTS ux_press_article_snapshot_claim
  ON read_models.press_article_snapshot (fact_claim_id);
CREATE INDEX IF NOT EXISTS ix_press_article_snapshot_date
  ON read_models.press_article_snapshot (event_date DESC, published_at DESC);
CREATE INDEX IF NOT EXISTS ix_press_article_snapshot_topic
  ON read_models.press_article_snapshot (topic);
CREATE INDEX IF NOT EXISTS ix_press_article_snapshot_tone
  ON read_models.press_article_snapshot (tone);
CREATE INDEX IF NOT EXISTS ix_press_article_snapshot_outlet
  ON read_models.press_article_snapshot (outlet);
CREATE INDEX IF NOT EXISTS ix_press_article_snapshot_region
  ON read_models.press_article_snapshot (region);
CREATE UNIQUE INDEX IF NOT EXISTS ux_press_term_snapshot_claim_term
  ON read_models.press_term_mention_snapshot (fact_claim_id, term);
CREATE INDEX IF NOT EXISTS ix_press_term_snapshot_term
  ON read_models.press_term_mention_snapshot (term);
`;

const grants = `
DO $$
DECLARE
  role_name text;
BEGIN
  FOREACH role_name IN ARRAY ARRAY['backend_reader', 'backup_operator'] LOOP
    IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = role_name) THEN
      EXECUTE format(
        'GRANT SELECT ON read_models.press_article_snapshot TO %I', role_name);
      EXECUTE format(
        'GRANT SELECT ON read_models.press_term_mention_snapshot TO %I', role_name);
    END IF;
  END LOOP;
END;
$$;
`;

export async function up({ context }: MigrationContext): Promise<void> {
  await context.sequelize.query(snapshots);
  await context.sequelize.query(indexes);
  await context.sequelize.query(grants);
}

export async function down({ context }: MigrationContext): Promise<void> {
  await context.sequelize.query(
    `DROP MATERIALIZED VIEW IF EXISTS read_models.press_term_mention_snapshot;
     DROP MATERIALIZED VIEW IF EXISTS read_models.press_article_snapshot;`,
  );
}
