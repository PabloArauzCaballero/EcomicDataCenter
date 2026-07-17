#!/usr/bin/env python3
from __future__ import annotations

import json
import re
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
CATALOG = ROOT / 'docs/model/model-catalog.json'
OUT = ROOT / 'src/database/migrations'

SCHEMAS = ['provenance', 'semantic', 'metadata', 'statistics', 'quality_lineage', 'read_models']

FK_TARGETS = {
    'provenance.organization.parent_organization_id': ('provenance', 'organization', 'organization_id'),
    'provenance.source.organization_id': ('provenance', 'organization', 'organization_id'),
    'provenance.source.frequency_id': ('semantic', 'frequency', 'frequency_id'),
    'provenance.source_artifact.source_id': ('provenance', 'source', 'source_id'),
    'provenance.data_entry_batch.dataset_version_id': ('metadata', 'dataset_version', 'dataset_version_id'),
    'provenance.data_entry_batch.source_artifact_id': ('provenance', 'source_artifact', 'source_artifact_id'),
    'provenance.data_entry_batch.submitted_by_organization_id': ('provenance', 'organization', 'organization_id'),
    'semantic.statistical_domain.parent_domain_id': ('semantic', 'statistical_domain', 'statistical_domain_id'),
    'semantic.concept.owner_organization_id': ('provenance', 'organization', 'organization_id'),
    'semantic.code_list.owner_organization_id': ('provenance', 'organization', 'organization_id'),
    'semantic.code_item.code_list_id': ('semantic', 'code_list', 'code_list_id'),
    'semantic.code_item.parent_code_item_id': ('semantic', 'code_item', 'code_item_id'),
    'semantic.classification.custodian_organization_id': ('provenance', 'organization', 'organization_id'),
    'semantic.classification_version.classification_id': ('semantic', 'classification', 'classification_id'),
    'semantic.classification_item.classification_version_id': ('semantic', 'classification_version', 'classification_version_id'),
    'semantic.classification_item.parent_item_id': ('semantic', 'classification_item', 'classification_item_id'),
    'semantic.classification_mapping.source_item_id': ('semantic', 'classification_item', 'classification_item_id'),
    'semantic.classification_mapping.target_item_id': ('semantic', 'classification_item', 'classification_item_id'),
    'semantic.geographic_unit.parent_geographic_unit_id': ('semantic', 'geographic_unit', 'geographic_unit_id'),
    'semantic.unit_measure.base_unit_measure_id': ('semantic', 'unit_measure', 'unit_measure_id'),
    'metadata.statistical_operation.producer_organization_id': ('provenance', 'organization', 'organization_id'),
    'metadata.methodology.owner_organization_id': ('provenance', 'organization', 'organization_id'),
    'metadata.methodology_version.methodology_id': ('metadata', 'methodology', 'methodology_id'),
    'metadata.dataset.statistical_operation_id': ('metadata', 'statistical_operation', 'statistical_operation_id'),
    'metadata.dataset.source_id': ('provenance', 'source', 'source_id'),
    'metadata.dataset.producer_organization_id': ('provenance', 'organization', 'organization_id'),
    'metadata.dataset.statistical_domain_id': ('semantic', 'statistical_domain', 'statistical_domain_id'),
    'metadata.dataset_version.dataset_id': ('metadata', 'dataset', 'dataset_id'),
    'metadata.dataset_version.methodology_version_id': ('metadata', 'methodology_version', 'methodology_version_id'),
    'metadata.dataset_version.data_structure_id': ('metadata', 'data_structure', 'data_structure_id'),
    'metadata.data_structure.owner_organization_id': ('provenance', 'organization', 'organization_id'),
    'metadata.dimension_definition.data_structure_id': ('metadata', 'data_structure', 'data_structure_id'),
    'metadata.dimension_definition.concept_id': ('semantic', 'concept', 'concept_id'),
    'metadata.dimension_definition.code_list_id': ('semantic', 'code_list', 'code_list_id'),
    'metadata.dimension_definition.classification_version_id': ('semantic', 'classification_version', 'classification_version_id'),
    'metadata.measure_definition.data_structure_id': ('metadata', 'data_structure', 'data_structure_id'),
    'metadata.measure_definition.concept_id': ('semantic', 'concept', 'concept_id'),
    'metadata.measure_definition.unit_measure_id': ('semantic', 'unit_measure', 'unit_measure_id'),
    'metadata.attribute_definition.data_structure_id': ('metadata', 'data_structure', 'data_structure_id'),
    'metadata.attribute_definition.concept_id': ('semantic', 'concept', 'concept_id'),
    'metadata.attribute_definition.code_list_id': ('semantic', 'code_list', 'code_list_id'),
    'statistics.indicator.statistical_domain_id': ('semantic', 'statistical_domain', 'statistical_domain_id'),
    'statistics.indicator.owner_organization_id': ('provenance', 'organization', 'organization_id'),
    'statistics.indicator_version.indicator_id': ('statistics', 'indicator', 'indicator_id'),
    'statistics.indicator_version.methodology_version_id': ('metadata', 'methodology_version', 'methodology_version_id'),
    'statistics.indicator_version.unit_measure_id': ('semantic', 'unit_measure', 'unit_measure_id'),
    'statistics.indicator_version.frequency_id': ('semantic', 'frequency', 'frequency_id'),
    'statistics.dataset_indicator.dataset_version_id': ('metadata', 'dataset_version', 'dataset_version_id'),
    'statistics.dataset_indicator.indicator_version_id': ('statistics', 'indicator_version', 'indicator_version_id'),
    'statistics.series.dataset_version_id': ('metadata', 'dataset_version', 'dataset_version_id'),
    'statistics.series.indicator_version_id': ('statistics', 'indicator_version', 'indicator_version_id'),
    'statistics.series.frequency_id': ('semantic', 'frequency', 'frequency_id'),
    'statistics.series.unit_measure_id': ('semantic', 'unit_measure', 'unit_measure_id'),
    'statistics.series_dimension_value.series_id': ('statistics', 'series', 'series_id'),
    'statistics.series_dimension_value.dimension_definition_id': ('metadata', 'dimension_definition', 'dimension_definition_id'),
    'statistics.series_dimension_value.code_item_id': ('semantic', 'code_item', 'code_item_id'),
    'statistics.series_dimension_value.classification_item_id': ('semantic', 'classification_item', 'classification_item_id'),
    'statistics.series_dimension_value.geographic_unit_id': ('semantic', 'geographic_unit', 'geographic_unit_id'),
    'statistics.observation.series_id': ('statistics', 'series', 'series_id'),
    'statistics.observation_revision.observation_id': ('statistics', 'observation', 'observation_id'),
    'statistics.observation_revision.source_artifact_id': ('provenance', 'source_artifact', 'source_artifact_id'),
    'statistics.observation_revision.data_entry_batch_id': ('provenance', 'data_entry_batch', 'data_entry_batch_id'),
    'statistics.observation_measure.observation_revision_id': ('statistics', 'observation_revision', 'observation_revision_id'),
    'statistics.observation_measure.measure_definition_id': ('metadata', 'measure_definition', 'measure_definition_id'),
    'statistics.observation_attribute_value.observation_revision_id': ('statistics', 'observation_revision', 'observation_revision_id'),
    'statistics.observation_attribute_value.attribute_definition_id': ('metadata', 'attribute_definition', 'attribute_definition_id'),
    'statistics.observation_attribute_value.code_item_id': ('semantic', 'code_item', 'code_item_id'),
    'quality_lineage.quality_rule.quality_dimension_id': ('quality_lineage', 'quality_dimension', 'quality_dimension_id'),
    'quality_lineage.quality_assessment.quality_rule_id': ('quality_lineage', 'quality_rule', 'quality_rule_id'),
    'quality_lineage.quality_assessment.data_entry_batch_id': ('provenance', 'data_entry_batch', 'data_entry_batch_id'),
    'quality_lineage.data_issue.quality_assessment_id': ('quality_lineage', 'quality_assessment', 'quality_assessment_id'),
    'quality_lineage.lineage_relation.methodology_version_id': ('metadata', 'methodology_version', 'methodology_version_id'),
    'quality_lineage.indicator_relation.source_indicator_version_id': ('statistics', 'indicator_version', 'indicator_version_id'),
    'quality_lineage.indicator_relation.target_indicator_version_id': ('statistics', 'indicator_version', 'indicator_version_id'),
    'quality_lineage.series_break.series_id': ('statistics', 'series', 'series_id'),
    'quality_lineage.series_break.methodology_version_id': ('metadata', 'methodology_version', 'methodology_version_id'),
}


def sql_type(raw: str, primary: bool) -> str:
    base = raw.removesuffix('?')
    if base == 'uuid': return 'uuid'
    if base.startswith('varchar') or base.startswith('char') or base.startswith('numeric'): return base
    if base == 'text': return 'text'
    if base == 'boolean': return 'boolean'
    if base == 'date': return 'date'
    if base == 'timestamptz': return 'timestamptz'
    if base == 'jsonb': return 'jsonb'
    if base == 'integer': return 'integer'
    if base == 'smallint': return 'smallint'
    if base == 'bigint': return 'bigint GENERATED BY DEFAULT AS IDENTITY' if primary else 'bigint'
    raise ValueError(base)


def constraint_name(prefix: str, table: str, columns: list[str]) -> str:
    raw = f'{prefix}_{table}_{"_".join(columns)}'
    return raw[:62]


def parse_unique(text: str) -> list[str]:
    return [part.strip() for part in text.removeprefix('UQ(').removesuffix(')').split(',')]


def checks_for(table: str, fields: set[str]) -> list[tuple[str, str]]:
    checks: list[tuple[str, str]] = []
    pairs = [('valid_from', 'valid_to'), ('active_from', 'active_to'), ('start_date', 'end_date')]
    for start, end in pairs:
        if start in fields and end in fields:
            checks.append((f'ck_{table}_{start}_{end}', f'{end} IS NULL OR {end} >= {start}'))
    if {'period_start', 'period_end'} <= fields:
        checks.append((f'ck_{table}_period', 'period_end >= period_start'))
    if table == 'data_entry_batch':
        checks += [
            ('ck_batch_counts_nonnegative', 'received_count >= 0 AND accepted_count >= 0 AND rejected_count >= 0'),
            ('ck_batch_counts_total', 'accepted_count + rejected_count <= received_count'),
            ('ck_batch_status', "status IN ('CREATED','VALIDATING','ACCEPTED','COMMITTING','COMMITTED','PARTIAL','FAILED','REJECTED','CANCELLED')"),
        ]
    if table == 'source_artifact': checks.append(('ck_source_artifact_size', 'file_size_bytes IS NULL OR file_size_bytes >= 0'))
    if table == 'methodology_version': checks.append(('ck_methodology_version_status', "status IN ('DRAFT','TECHNICAL_REVIEW','METHODOLOGICAL_REVIEW','APPROVED','PUBLISHED','SUPERSEDED','WITHDRAWN','REJECTED')"))
    if table == 'dataset_version': checks.append(('ck_dataset_version_status', "status IN ('DRAFT','UNDER_REVIEW','APPROVED','PUBLISHED','SUPERSEDED','WITHDRAWN','REJECTED')"))
    if table == 'series': checks.append(('ck_series_status', "status IN ('ACTIVE','SUSPENDED','DISCONTINUED','SUPERSEDED')"))
    if table == 'observation_revision':
        checks += [
            ('ck_observation_revision_status', "status IN ('DRAFT','VALIDATED','PUBLISHED','SUPERSEDED','WITHDRAWN','REJECTED')"),
            ('ck_observation_revision_number', 'revision_number > 0'),
            ('ck_observation_revision_validity', 'valid_to IS NULL OR valid_to > valid_from'),
        ]
    if table == 'data_issue': checks.append(('ck_data_issue_status', "status IN ('OPEN','TRIAGED','IN_CORRECTION','RESOLVED','VERIFIED','CLOSED','REOPENED','DISMISSED')"))
    if table == 'series_dimension_value': checks.append(('ck_series_dimension_one_value', 'num_nonnulls(code_item_id, classification_item_id, geographic_unit_id, text_value, numeric_value, date_value) = 1'))
    if table == 'observation_measure': checks.append(('ck_observation_measure_one_value', 'num_nonnulls(numeric_value, text_value, boolean_value) = 1'))
    if table == 'observation_attribute_value': checks.append(('ck_observation_attribute_one_value', 'num_nonnulls(code_item_id, numeric_value, text_value, boolean_value) = 1'))
    if table == 'indicator_version': checks.append(('ck_indicator_version_number', 'version_number > 0'))
    if table == 'dimension_definition': checks.append(('ck_dimension_position', 'position_no > 0'))
    if table == 'frequency': checks.append(('ck_frequency_periods', 'periods_per_year IS NULL OR periods_per_year > 0'))
    if table == 'classification_mapping': checks.append(('ck_classification_mapping_weight', 'weight IS NULL OR weight >= 0'))
    if table in {'dataset', 'indicator'} and 'data_nature' in fields:
        checks.append((f'ck_{table}_data_nature', "data_nature IN ('OFFICIAL_STATISTIC','ADMINISTRATIVE_RECORD','OFFICIAL_EXTERNAL','OBSERVATORY_DERIVED','ACADEMIC_ESTIMATE','EXPERIMENTAL','FORECAST','SCENARIO')"))
    return checks


def render_schema_migration(schema: str, entities: list[dict]) -> str:
    statements: list[str] = []
    for entity in entities:
        table = entity['table']
        columns: list[str] = []
        field_names = {field['field'] for field in entity['fields']}
        for field in entity['fields']:
            definition = f'  {field["field"]} {sql_type(field["type"], field["primary_key"])}'
            if not field['nullable']:
                definition += ' NOT NULL'
            if field['primary_key']:
                definition += ' PRIMARY KEY'
            if field['unique']:
                definition += ' UNIQUE'
            columns.append(definition)
        for unique in entity.get('unique_constraints', []):
            cols = parse_unique(unique)
            columns.append(f'  CONSTRAINT {constraint_name("uq", table, cols)} UNIQUE ({", ".join(cols)})')
        for name, expression in checks_for(table, field_names):
            columns.append(f'  CONSTRAINT {name} CHECK ({expression})')
        statements.append(f'CREATE TABLE {schema}.{table} (\n' + ',\n'.join(columns) + '\n);')
    sql = '\n\n'.join(statements)
    return f"""import type {{ MigrationContext }} from '../migration.types';

export async function up({{ context }}: MigrationContext): Promise<void> {{
  await context.sequelize.query(`
{sql}
  `);
}}

export async function down({{ context }}: MigrationContext): Promise<void> {{
  await context.sequelize.query(`
{chr(10).join(f'DROP TABLE IF EXISTS {schema}.{e["table"]} CASCADE;' for e in reversed(entities))}
  `);
}}
"""


def render_foreign_keys(data: dict) -> str:
    adds: list[str] = []
    drops: list[str] = []
    for entity in data['entities']:
        schema, table = entity['package'], entity['table']
        for field in entity['fields']:
            if not field['foreign_key']:
                continue
            key = f'{schema}.{table}.{field["field"]}'
            target = FK_TARGETS.get(key)
            if not target:
                raise KeyError(f'Missing FK mapping: {key}')
            target_schema, target_table, target_column = target
            name = constraint_name('fk', table, [field['field']])
            adds.append(
                f'ALTER TABLE {schema}.{table} ADD CONSTRAINT {name} FOREIGN KEY ({field["field"]}) '
                f'REFERENCES {target_schema}.{target_table} ({target_column}) ON UPDATE CASCADE ON DELETE RESTRICT;'
            )
            drops.append(f'ALTER TABLE {schema}.{table} DROP CONSTRAINT IF EXISTS {name};')
    return f"""import type {{ MigrationContext }} from '../migration.types';

export async function up({{ context }}: MigrationContext): Promise<void> {{
  await context.sequelize.query(`
{chr(10).join(adds)}
  `);
}}

export async function down({{ context }}: MigrationContext): Promise<void> {{
  await context.sequelize.query(`
{chr(10).join(reversed(drops))}
  `);
}}
"""


def main() -> None:
    OUT.mkdir(parents=True, exist_ok=True)
    data = json.loads(CATALOG.read_text(encoding='utf-8'))
    (OUT / '0001-create-schemas.ts').write_text(
        "import type { MigrationContext } from '../migration.types';\n\n"
        "export async function up({ context }: MigrationContext): Promise<void> {\n"
        "  await context.sequelize.query(`\n" + '\n'.join(f'CREATE SCHEMA IF NOT EXISTS {s};' for s in SCHEMAS) + "\n  `);\n}\n\n"
        "export async function down({ context }: MigrationContext): Promise<void> {\n"
        "  await context.sequelize.query(`\n" + '\n'.join(f'DROP SCHEMA IF EXISTS {s} CASCADE;' for s in reversed(SCHEMAS)) + "\n  `);\n}\n",
        encoding='utf-8',
    )
    for index, schema in enumerate(SCHEMAS[:5], start=2):
        entities = [e for e in data['entities'] if e['package'] == schema]
        (OUT / f'{index:04d}-create-{schema}-tables.ts').write_text(render_schema_migration(schema, entities), encoding='utf-8')
    (OUT / '0007-add-foreign-keys.ts').write_text(render_foreign_keys(data), encoding='utf-8')


if __name__ == '__main__':
    main()
