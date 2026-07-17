import type { MigrationContext } from '../migration.types';

export async function up({ context }: MigrationContext): Promise<void> {
  await context.sequelize.query(`
CREATE TABLE semantic.statistical_domain (
  statistical_domain_id uuid NOT NULL PRIMARY KEY,
  parent_domain_id uuid,
  code varchar(50) NOT NULL UNIQUE,
  name varchar(180) NOT NULL,
  description text,
  sort_order integer NOT NULL,
  is_active boolean NOT NULL
);

CREATE TABLE semantic.concept (
  concept_id uuid NOT NULL PRIMARY KEY,
  owner_organization_id uuid NOT NULL,
  code varchar(80) NOT NULL,
  name varchar(180) NOT NULL,
  definition text NOT NULL,
  concept_type varchar(40) NOT NULL,
  valid_from date,
  valid_to date,
  CONSTRAINT uq_concept_owner_organization_id_code UNIQUE (owner_organization_id, code),
  CONSTRAINT ck_concept_valid_from_valid_to CHECK (valid_to IS NULL OR valid_to >= valid_from)
);

CREATE TABLE semantic.code_list (
  code_list_id uuid NOT NULL PRIMARY KEY,
  owner_organization_id uuid NOT NULL,
  code varchar(80) NOT NULL,
  name varchar(180) NOT NULL,
  version_code varchar(40) NOT NULL,
  valid_from date,
  valid_to date,
  CONSTRAINT uq_code_list_owner_organization_id_code_version_code UNIQUE (owner_organization_id, code, version_code),
  CONSTRAINT ck_code_list_valid_from_valid_to CHECK (valid_to IS NULL OR valid_to >= valid_from)
);

CREATE TABLE semantic.code_item (
  code_item_id uuid NOT NULL PRIMARY KEY,
  code_list_id uuid NOT NULL,
  parent_code_item_id uuid,
  code varchar(80) NOT NULL,
  name varchar(250) NOT NULL,
  description text,
  sort_order integer NOT NULL,
  valid_from date,
  valid_to date,
  is_active boolean NOT NULL,
  CONSTRAINT uq_code_item_code_list_id_code UNIQUE (code_list_id, code),
  CONSTRAINT ck_code_item_valid_from_valid_to CHECK (valid_to IS NULL OR valid_to >= valid_from)
);

CREATE TABLE semantic.classification (
  classification_id uuid NOT NULL PRIMARY KEY,
  custodian_organization_id uuid NOT NULL,
  code varchar(80) NOT NULL,
  name varchar(250) NOT NULL,
  classification_type varchar(50) NOT NULL,
  CONSTRAINT uq_classification_custodian_organization_id_code UNIQUE (custodian_organization_id, code)
);

CREATE TABLE semantic.classification_version (
  classification_version_id uuid NOT NULL PRIMARY KEY,
  classification_id uuid NOT NULL,
  version_code varchar(40) NOT NULL,
  name varchar(250) NOT NULL,
  valid_from date,
  valid_to date,
  publication_date date,
  is_current boolean NOT NULL,
  methodology_uri text,
  CONSTRAINT uq_classification_version_classification_id_version_code UNIQUE (classification_id, version_code),
  CONSTRAINT ck_classification_version_valid_from_valid_to CHECK (valid_to IS NULL OR valid_to >= valid_from)
);

CREATE TABLE semantic.classification_item (
  classification_item_id uuid NOT NULL PRIMARY KEY,
  classification_version_id uuid NOT NULL,
  parent_item_id uuid,
  code varchar(80) NOT NULL,
  name varchar(300) NOT NULL,
  description text,
  level_no integer NOT NULL,
  sort_order integer NOT NULL,
  valid_from date,
  valid_to date,
  CONSTRAINT uq_classification_item_classification_version_id_code UNIQUE (classification_version_id, code),
  CONSTRAINT ck_classification_item_valid_from_valid_to CHECK (valid_to IS NULL OR valid_to >= valid_from)
);

CREATE TABLE semantic.classification_mapping (
  classification_mapping_id uuid NOT NULL PRIMARY KEY,
  source_item_id uuid NOT NULL,
  target_item_id uuid NOT NULL,
  equivalence_type varchar(30) NOT NULL,
  weight numeric(18,10),
  valid_from date,
  valid_to date,
  evidence_note text,
  CONSTRAINT uq_classification_mapping_source_item_id_target_item_id_valid_ UNIQUE (source_item_id, target_item_id, valid_from),
  CONSTRAINT ck_classification_mapping_valid_from_valid_to CHECK (valid_to IS NULL OR valid_to >= valid_from),
  CONSTRAINT ck_classification_mapping_weight CHECK (weight IS NULL OR weight >= 0)
);

CREATE TABLE semantic.geographic_unit (
  geographic_unit_id uuid NOT NULL PRIMARY KEY,
  parent_geographic_unit_id uuid,
  official_code varchar(80) NOT NULL,
  name varchar(250) NOT NULL,
  geographic_level varchar(40) NOT NULL,
  valid_from date NOT NULL,
  valid_to date,
  geometry_reference text,
  CONSTRAINT uq_geographic_unit_official_code_valid_from UNIQUE (official_code, valid_from),
  CONSTRAINT ck_geographic_unit_valid_from_valid_to CHECK (valid_to IS NULL OR valid_to >= valid_from)
);

CREATE TABLE semantic.unit_measure (
  unit_measure_id uuid NOT NULL PRIMARY KEY,
  base_unit_measure_id uuid,
  code varchar(50) NOT NULL UNIQUE,
  name varchar(180) NOT NULL,
  symbol varchar(30),
  multiplier_power10 smallint NOT NULL,
  value_kind varchar(30) NOT NULL
);

CREATE TABLE semantic.frequency (
  frequency_id uuid NOT NULL PRIMARY KEY,
  code varchar(10) NOT NULL UNIQUE,
  name varchar(80) NOT NULL,
  periods_per_year smallint,
  iso_duration varchar(40),
  CONSTRAINT ck_frequency_periods CHECK (periods_per_year IS NULL OR periods_per_year > 0)
);
  `);
}

export async function down({ context }: MigrationContext): Promise<void> {
  await context.sequelize.query(`
DROP TABLE IF EXISTS semantic.frequency CASCADE;
DROP TABLE IF EXISTS semantic.unit_measure CASCADE;
DROP TABLE IF EXISTS semantic.geographic_unit CASCADE;
DROP TABLE IF EXISTS semantic.classification_mapping CASCADE;
DROP TABLE IF EXISTS semantic.classification_item CASCADE;
DROP TABLE IF EXISTS semantic.classification_version CASCADE;
DROP TABLE IF EXISTS semantic.classification CASCADE;
DROP TABLE IF EXISTS semantic.code_item CASCADE;
DROP TABLE IF EXISTS semantic.code_list CASCADE;
DROP TABLE IF EXISTS semantic.concept CASCADE;
DROP TABLE IF EXISTS semantic.statistical_domain CASCADE;
  `);
}
