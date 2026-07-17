import type { MigrationContext } from '../migration.types';

/** Adds durable request fingerprints and replayable results to ingestion batches. */
export async function up({ context }: MigrationContext): Promise<void> {
  await context.sequelize.query(`
ALTER TABLE provenance.data_entry_batch
  ADD COLUMN IF NOT EXISTS request_fingerprint char(64);

ALTER TABLE provenance.data_entry_batch
  ADD COLUMN IF NOT EXISTS result_json jsonb;

UPDATE provenance.data_entry_batch
SET request_fingerprint = md5(batch_code || ':' || data_entry_batch_id::text)
                        || md5(data_entry_batch_id::text || ':' || batch_code)
WHERE request_fingerprint IS NULL;

ALTER TABLE provenance.data_entry_batch
  ALTER COLUMN request_fingerprint SET NOT NULL;

ALTER TABLE provenance.data_entry_batch
  ADD CONSTRAINT ck_batch_request_fingerprint_format
    CHECK (request_fingerprint ~ '^[a-f0-9]{64}$');
  `);
}

/** Removes batch replay metadata. */
export async function down({ context }: MigrationContext): Promise<void> {
  await context.sequelize.query(`
ALTER TABLE provenance.data_entry_batch
  DROP CONSTRAINT IF EXISTS ck_batch_request_fingerprint_format;

ALTER TABLE provenance.data_entry_batch
  DROP COLUMN IF EXISTS result_json;

ALTER TABLE provenance.data_entry_batch
  DROP COLUMN IF EXISTS request_fingerprint;
  `);
}
