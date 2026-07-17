import type { MigrationContext } from '../migration.types';

export async function up({ context }: MigrationContext): Promise<void> {
  await context.sequelize.query(`
CREATE TABLE provenance.organization (
  organization_id uuid NOT NULL PRIMARY KEY,
  parent_organization_id uuid,
  code varchar(50) NOT NULL UNIQUE,
  legal_name varchar(250) NOT NULL,
  short_name varchar(80) NOT NULL,
  organization_type varchar(40) NOT NULL,
  country_code char(2) NOT NULL,
  official_statistics_producer boolean NOT NULL,
  is_active boolean NOT NULL,
  valid_from date NOT NULL,
  valid_to date,
  CONSTRAINT ck_organization_valid_from_valid_to CHECK (valid_to IS NULL OR valid_to >= valid_from)
);

CREATE TABLE provenance.source (
  source_id uuid NOT NULL PRIMARY KEY,
  organization_id uuid NOT NULL,
  frequency_id uuid,
  code varchar(80) NOT NULL UNIQUE,
  name varchar(250) NOT NULL,
  source_type varchar(40) NOT NULL,
  access_method varchar(40) NOT NULL,
  official_uri text,
  license_code varchar(80),
  active_from date,
  active_to date,
  is_active boolean NOT NULL,
  CONSTRAINT ck_source_active_from_active_to CHECK (active_to IS NULL OR active_to >= active_from)
);

CREATE TABLE provenance.source_artifact (
  source_artifact_id uuid NOT NULL PRIMARY KEY,
  source_id uuid NOT NULL,
  artifact_type varchar(40) NOT NULL,
  original_filename varchar(255),
  original_uri text,
  storage_uri text NOT NULL,
  mime_type varchar(120),
  sha256 char(64) NOT NULL UNIQUE,
  publication_date date,
  retrieved_at timestamptz NOT NULL,
  file_size_bytes bigint,
  metadata_json jsonb NOT NULL,
  CONSTRAINT ck_source_artifact_size CHECK (file_size_bytes IS NULL OR file_size_bytes >= 0)
);

CREATE TABLE provenance.data_entry_batch (
  data_entry_batch_id uuid NOT NULL PRIMARY KEY,
  dataset_version_id uuid NOT NULL,
  source_artifact_id uuid,
  submitted_by_organization_id uuid NOT NULL,
  batch_code varchar(80) NOT NULL UNIQUE,
  entry_method varchar(30) NOT NULL,
  status varchar(30) NOT NULL,
  received_count bigint NOT NULL,
  accepted_count bigint NOT NULL,
  rejected_count bigint NOT NULL,
  submitted_at timestamptz NOT NULL,
  started_at timestamptz,
  completed_at timestamptz,
  notes text,
  CONSTRAINT ck_batch_counts_nonnegative CHECK (received_count >= 0 AND accepted_count >= 0 AND rejected_count >= 0),
  CONSTRAINT ck_batch_counts_total CHECK (accepted_count + rejected_count <= received_count),
  CONSTRAINT ck_batch_status CHECK (status IN ('CREATED','VALIDATING','ACCEPTED','COMMITTING','COMMITTED','PARTIAL','FAILED','REJECTED','CANCELLED'))
);
  `);
}

export async function down({ context }: MigrationContext): Promise<void> {
  await context.sequelize.query(`
DROP TABLE IF EXISTS provenance.data_entry_batch CASCADE;
DROP TABLE IF EXISTS provenance.source_artifact CASCADE;
DROP TABLE IF EXISTS provenance.source CASCADE;
DROP TABLE IF EXISTS provenance.organization CASCADE;
  `);
}
