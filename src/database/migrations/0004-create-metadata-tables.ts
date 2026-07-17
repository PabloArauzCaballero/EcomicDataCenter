import type { MigrationContext } from '../migration.types';

export async function up({ context }: MigrationContext): Promise<void> {
  await context.sequelize.query(`
CREATE TABLE metadata.statistical_operation (
  statistical_operation_id uuid NOT NULL PRIMARY KEY,
  producer_organization_id uuid NOT NULL,
  code varchar(80) NOT NULL,
  name varchar(250) NOT NULL,
  operation_type varchar(40) NOT NULL,
  objective text NOT NULL,
  population_scope text,
  geographic_scope text,
  collection_method text,
  start_date date,
  end_date date,
  status varchar(30) NOT NULL,
  CONSTRAINT uq_statistical_operation_producer_organization_id_code UNIQUE (producer_organization_id, code),
  CONSTRAINT ck_statistical_operation_start_date_end_date CHECK (end_date IS NULL OR end_date >= start_date)
);

CREATE TABLE metadata.methodology (
  methodology_id uuid NOT NULL PRIMARY KEY,
  owner_organization_id uuid NOT NULL,
  code varchar(80) NOT NULL,
  name varchar(250) NOT NULL,
  methodology_type varchar(40) NOT NULL,
  description text,
  is_official boolean NOT NULL,
  is_active boolean NOT NULL,
  CONSTRAINT uq_methodology_owner_organization_id_code UNIQUE (owner_organization_id, code)
);

CREATE TABLE metadata.methodology_version (
  methodology_version_id uuid NOT NULL PRIMARY KEY,
  methodology_id uuid NOT NULL,
  version_code varchar(40) NOT NULL,
  title varchar(300) NOT NULL,
  status varchar(30) NOT NULL,
  formula_description text,
  universe_definition text,
  sampling_method text,
  missing_data_treatment text,
  seasonal_adjustment_method text,
  revision_policy text,
  confidentiality_policy text,
  valid_from date NOT NULL,
  valid_to date,
  publication_date date,
  document_uri text,
  is_current boolean NOT NULL,
  CONSTRAINT uq_methodology_version_methodology_id_version_code UNIQUE (methodology_id, version_code),
  CONSTRAINT ck_methodology_version_valid_from_valid_to CHECK (valid_to IS NULL OR valid_to >= valid_from),
  CONSTRAINT ck_methodology_version_status CHECK (status IN ('DRAFT','TECHNICAL_REVIEW','METHODOLOGICAL_REVIEW','APPROVED','PUBLISHED','SUPERSEDED','WITHDRAWN','REJECTED'))
);

CREATE TABLE metadata.dataset (
  dataset_id uuid NOT NULL PRIMARY KEY,
  statistical_operation_id uuid,
  source_id uuid NOT NULL,
  producer_organization_id uuid NOT NULL,
  statistical_domain_id uuid NOT NULL,
  code varchar(80) NOT NULL,
  name varchar(300) NOT NULL,
  description text,
  data_nature varchar(40) NOT NULL,
  publication_status varchar(30) NOT NULL,
  license_code varchar(80),
  confidentiality_level varchar(30) NOT NULL,
  CONSTRAINT uq_dataset_producer_organization_id_code UNIQUE (producer_organization_id, code),
  CONSTRAINT ck_dataset_data_nature CHECK (data_nature IN ('OFFICIAL_STATISTIC','ADMINISTRATIVE_RECORD','OFFICIAL_EXTERNAL','OBSERVATORY_DERIVED','ACADEMIC_ESTIMATE','EXPERIMENTAL','FORECAST','SCENARIO'))
);

CREATE TABLE metadata.dataset_version (
  dataset_version_id uuid NOT NULL PRIMARY KEY,
  dataset_id uuid NOT NULL,
  methodology_version_id uuid NOT NULL,
  data_structure_id uuid NOT NULL,
  version_code varchar(40) NOT NULL,
  title varchar(300) NOT NULL,
  status varchar(30) NOT NULL,
  reference_base_period varchar(40),
  valid_from date NOT NULL,
  valid_to date,
  publication_date date,
  is_current boolean NOT NULL,
  change_reason text,
  CONSTRAINT uq_dataset_version_dataset_id_version_code UNIQUE (dataset_id, version_code),
  CONSTRAINT ck_dataset_version_valid_from_valid_to CHECK (valid_to IS NULL OR valid_to >= valid_from),
  CONSTRAINT ck_dataset_version_status CHECK (status IN ('DRAFT','UNDER_REVIEW','APPROVED','PUBLISHED','SUPERSEDED','WITHDRAWN','REJECTED'))
);

CREATE TABLE metadata.data_structure (
  data_structure_id uuid NOT NULL PRIMARY KEY,
  owner_organization_id uuid NOT NULL,
  code varchar(80) NOT NULL,
  name varchar(250) NOT NULL,
  version_code varchar(40) NOT NULL,
  valid_from date,
  valid_to date,
  is_active boolean NOT NULL,
  CONSTRAINT uq_data_structure_owner_organization_id_code_version_code UNIQUE (owner_organization_id, code, version_code),
  CONSTRAINT ck_data_structure_valid_from_valid_to CHECK (valid_to IS NULL OR valid_to >= valid_from)
);

CREATE TABLE metadata.dimension_definition (
  dimension_definition_id uuid NOT NULL PRIMARY KEY,
  data_structure_id uuid NOT NULL,
  concept_id uuid NOT NULL,
  code_list_id uuid,
  classification_version_id uuid,
  code varchar(80) NOT NULL,
  role varchar(30) NOT NULL,
  position_no smallint NOT NULL,
  attachment_level varchar(20) NOT NULL,
  representation_kind varchar(30) NOT NULL,
  is_required boolean NOT NULL,
  is_time_dimension boolean NOT NULL,
  CONSTRAINT uq_dimension_definition_data_structure_id_code UNIQUE (data_structure_id, code),
  CONSTRAINT uq_dimension_definition_data_structure_id_position_no UNIQUE (data_structure_id, position_no),
  CONSTRAINT ck_dimension_position CHECK (position_no > 0)
);

CREATE TABLE metadata.measure_definition (
  measure_definition_id uuid NOT NULL PRIMARY KEY,
  data_structure_id uuid NOT NULL,
  concept_id uuid NOT NULL,
  unit_measure_id uuid,
  code varchar(80) NOT NULL,
  name varchar(180) NOT NULL,
  data_type varchar(30) NOT NULL,
  precision_scale smallint,
  is_primary_measure boolean NOT NULL,
  CONSTRAINT uq_measure_definition_data_structure_id_code UNIQUE (data_structure_id, code)
);

CREATE TABLE metadata.attribute_definition (
  attribute_definition_id uuid NOT NULL PRIMARY KEY,
  data_structure_id uuid NOT NULL,
  concept_id uuid NOT NULL,
  code_list_id uuid,
  code varchar(80) NOT NULL,
  name varchar(180) NOT NULL,
  data_type varchar(30) NOT NULL,
  attachment_level varchar(20) NOT NULL,
  is_required boolean NOT NULL,
  CONSTRAINT uq_attribute_definition_data_structure_id_code UNIQUE (data_structure_id, code)
);
  `);
}

export async function down({ context }: MigrationContext): Promise<void> {
  await context.sequelize.query(`
DROP TABLE IF EXISTS metadata.attribute_definition CASCADE;
DROP TABLE IF EXISTS metadata.measure_definition CASCADE;
DROP TABLE IF EXISTS metadata.dimension_definition CASCADE;
DROP TABLE IF EXISTS metadata.data_structure CASCADE;
DROP TABLE IF EXISTS metadata.dataset_version CASCADE;
DROP TABLE IF EXISTS metadata.dataset CASCADE;
DROP TABLE IF EXISTS metadata.methodology_version CASCADE;
DROP TABLE IF EXISTS metadata.methodology CASCADE;
DROP TABLE IF EXISTS metadata.statistical_operation CASCADE;
  `);
}
