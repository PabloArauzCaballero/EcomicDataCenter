import type { MigrationContext } from '../migration.types';

/**
 * Closes two gaps the audit found in the temporal and retry model.
 *
 * Exchange rate quotations are only comparable when the originating time zone
 * is preserved next to the UTC timestamp, and a rejected agent item needs a
 * bounded retry count so a poisoned payload cannot be resubmitted forever.
 */
export async function up({ context }: MigrationContext): Promise<void> {
  await context.sequelize.query(`
ALTER TABLE statistics.observation_revision
  ADD COLUMN IF NOT EXISTS source_timezone varchar(64);

ALTER TABLE intelligence.raw_observation
  ADD COLUMN IF NOT EXISTS retry_count integer NOT NULL DEFAULT 0;

ALTER TABLE intelligence.raw_observation
  ADD COLUMN IF NOT EXISTS last_error text;

ALTER TABLE intelligence.raw_observation
  ADD COLUMN IF NOT EXISTS dead_lettered_at timestamptz;

ALTER TABLE intelligence.raw_observation
  ADD CONSTRAINT ck_raw_observation_retry_count CHECK (retry_count >= 0 AND retry_count <= 10);

ALTER TABLE intelligence.raw_observation
  DROP CONSTRAINT IF EXISTS ck_raw_observation_status;

ALTER TABLE intelligence.raw_observation
  ADD CONSTRAINT ck_raw_observation_status
    CHECK (processing_status IN ('RECEIVED','NORMALIZED','REJECTED','QUARANTINED','DEAD_LETTER'));

ALTER TABLE statistics.observation_revision
  ADD CONSTRAINT ck_observation_revision_source_timezone
    CHECK (source_timezone IS NULL OR source_timezone ~ '^[A-Za-z0-9_+/-]{1,64}$');

CREATE INDEX ix_raw_observation_dead_lettered_at ON intelligence.raw_observation (dead_lettered_at DESC);
  `);
}

export async function down({ context }: MigrationContext): Promise<void> {
  await context.sequelize.query(`
DROP INDEX IF EXISTS intelligence.ix_raw_observation_dead_lettered_at;

ALTER TABLE statistics.observation_revision
  DROP CONSTRAINT IF EXISTS ck_observation_revision_source_timezone;

ALTER TABLE intelligence.raw_observation
  DROP CONSTRAINT IF EXISTS ck_raw_observation_status;

ALTER TABLE intelligence.raw_observation
  ADD CONSTRAINT ck_raw_observation_status
    CHECK (processing_status IN ('RECEIVED','NORMALIZED','REJECTED','QUARANTINED'));

ALTER TABLE intelligence.raw_observation
  DROP CONSTRAINT IF EXISTS ck_raw_observation_retry_count;

ALTER TABLE intelligence.raw_observation DROP COLUMN IF EXISTS dead_lettered_at;
ALTER TABLE intelligence.raw_observation DROP COLUMN IF EXISTS last_error;
ALTER TABLE intelligence.raw_observation DROP COLUMN IF EXISTS retry_count;
ALTER TABLE statistics.observation_revision DROP COLUMN IF EXISTS source_timezone;
  `);
}
