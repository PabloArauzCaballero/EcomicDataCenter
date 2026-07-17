#!/usr/bin/env python3
from __future__ import annotations

import json
import re
from pathlib import Path

from physical_model_parser import (
    expected_type,
    leading_index_columns,
    load_fk_targets,
    migration_source,
    parse_fks,
    parse_tables,
)

ROOT = Path(__file__).resolve().parents[1]
MIGRATIONS = ROOT / 'src/database/migrations'
CATALOG = ROOT / 'docs/model/model-catalog.json'
GENERATOR = ROOT / 'scripts/generate_migrations.py'
ALL_SCHEMAS = {'provenance', 'semantic', 'metadata', 'statistics', 'quality_lineage', 'read_models'}
READER_TABLES = {
    'provenance.organization', 'provenance.source', 'provenance.source_artifact',
    'provenance.data_entry_batch', 'metadata.dataset', 'metadata.dataset_version',
    'metadata.methodology_version', 'metadata.dimension_definition',
    'metadata.measure_definition', 'metadata.attribute_definition', 'statistics.series',
    'statistics.series_dimension_value', 'statistics.observation',
    'statistics.observation_revision', 'statistics.observation_measure',
    'statistics.observation_attribute_value', 'quality_lineage.quality_assessment',
    'quality_lineage.data_issue', 'quality_lineage.lineage_relation',
    'quality_lineage.series_break', 'read_models.current_observation_value',
}
REQUIRED_CONSTRAINTS = {
    'ck_source_artifact_sha256_format', 'ck_batch_terminal_counts',
    'ck_dimension_representation_reference', 'ck_measure_precision_scale',
    'ck_attribute_code_list', 'ck_series_key_hash_format',
    'ck_observation_revision_hash_format', 'ck_observation_revision_current_published',
    'ck_data_issue_resolution_after_detection', 'ck_lineage_distinct_endpoints',
    'ck_indicator_relation_distinct_versions',
}
REQUIRED_TRIGGERS = {
    'trg_classification_parent_version', 'trg_code_item_parent_list',
    'trg_source_artifact_immutable_update', 'trg_series_indicator_membership',
    'trg_series_dimension_context', 'trg_observation_revision_context',
    'trg_observation_measure_context', 'trg_observation_attribute_context',
    'trg_revision_requires_measure', 'trg_measure_preserves_revision_measure',
}


def validate_catalog(catalog: dict[str, object], sql: str, errors: list[str]) -> None:
    tables = parse_tables(sql)
    entities = catalog['entities']
    expected_tables = {(entity['package'], entity['table']) for entity in entities}
    if set(tables) != expected_tables:
        errors.append(f'Table drift: expected={len(expected_tables)} actual={len(tables)}')

    field_count = 0
    for entity in entities:
        key = (entity['package'], entity['table'])
        if key not in tables:
            continue
        actual = tables[key]
        expected_columns = {field['field']: field for field in entity['fields']}
        field_count += len(expected_columns)
        if set(actual['columns']) != set(expected_columns):
            errors.append(f'Column drift in {key[0]}.{key[1]}')
            continue
        for name, field in expected_columns.items():
            column = actual['columns'][name]
            properties = {
                'type': (expected_type(field['type'], field['primary_key']), column['type']),
                'nullable': (field['nullable'], column['nullable']),
                'primary_key': (field['primary_key'], column['primary_key']),
                'unique': (field['unique'], column['unique']),
            }
            for property_name, (expected, received) in properties.items():
                if expected != received:
                    errors.append(f'{key[0]}.{key[1]}.{name} {property_name}: {expected} != {received}')
        expected_uniques = {
            tuple(part.strip() for part in value[3:-1].split(','))
            for value in entity['unique_constraints']
        }
        if not expected_uniques.issubset(actual['uniques']):
            errors.append(f'Unique constraint drift in {key[0]}.{key[1]}')
    if field_count != catalog['field_count']:
        errors.append(f'Field count drift: {field_count} != {catalog["field_count"]}')

    created_schemas = set(re.findall(r'CREATE SCHEMA IF NOT EXISTS\s+(\w+)', sql, re.I))
    if not ALL_SCHEMAS.issubset(created_schemas):
        errors.append(f'Missing schemas: {sorted(ALL_SCHEMAS - created_schemas)}')
    if any(schema == 'public' for schema, _ in tables):
        errors.append('Application table found in public schema')

    expected_fks = load_fk_targets(GENERATOR)
    actual_fks = parse_fks(sql)
    if actual_fks != expected_fks:
        errors.append('Foreign key target drift')
    missing_indexes = sorted(set(expected_fks) - leading_index_columns(sql, tables))
    if missing_indexes:
        errors.append(f'Foreign keys without leading index: {missing_indexes}')


def validate_hardening(sql: str, errors: list[str]) -> None:
    constraints = set(re.findall(r'ADD CONSTRAINT\s+(\w+)', sql, re.I))
    triggers = set(re.findall(r'CREATE(?: CONSTRAINT)? TRIGGER\s+(\w+)', sql, re.I))
    if not REQUIRED_CONSTRAINTS.issubset(constraints):
        errors.append(f'Missing constraints: {sorted(REQUIRED_CONSTRAINTS - constraints)}')
    if not REQUIRED_TRIGGERS.issubset(triggers):
        errors.append(f'Missing triggers: {sorted(REQUIRED_TRIGGERS - triggers)}')

    grants = (MIGRATIONS / '0014-harden-runtime-grants.ts').read_text(encoding='utf-8')
    up_grants = grants.split('export async function down', maxsplit=1)[0]
    table_block = re.search(
        r'GRANT SELECT ON TABLE(.*?)TO backend_reader;', up_grants, re.I | re.S,
    )
    granted = set(
        re.findall(
            r'\b(?:provenance|metadata|statistics|quality_lineage|read_models)\.\w+',
            table_block.group(1) if table_block else '',
        )
    )
    if granted != READER_TABLES:
        errors.append(
            'Reader whitelist drift: '
            f'missing={sorted(READER_TABLES - granted)} extra={sorted(granted - READER_TABLES)}'
        )
    schema_block = re.search(
        r'GRANT USAGE ON SCHEMA\s+([^;]+?)\s+TO backend_reader;', up_grants, re.I | re.S,
    )
    reader_schemas = {
        value.strip() for value in schema_block.group(1).split(',')
    } if schema_block else set()
    expected_reader_schemas = {'provenance', 'metadata', 'statistics', 'quality_lineage', 'read_models'}
    if reader_schemas != expected_reader_schemas:
        errors.append(f'Reader schema grant drift: {sorted(reader_schemas)}')
    if 'REVOKE ALL PRIVILEGES ON ALL TABLES' not in up_grants:
        errors.append('Broad grants are not reset before the reader whitelist')
    if 'REVOKE EXECUTE ON ALL FUNCTIONS' not in up_grants:
        errors.append('Function execution is not revoked from PUBLIC')
    if 'REVOKE EXECUTE ON FUNCTIONS FROM PUBLIC' not in up_grants:
        errors.append('Default function privileges are not hardened')
    if 'statistics.assert_revision_has_measure(bigint)' not in up_grants:
        errors.append('Writer function whitelist is incomplete')

    numbers = [int(path.name[:4]) for path in sorted(MIGRATIONS.glob('[0-9][0-9][0-9][0-9]-*.ts'))]
    if numbers != list(range(1, max(numbers) + 1)):
        errors.append(f'Migration sequence is not contiguous: {numbers}')
    for path in MIGRATIONS.glob('*.ts'):
        content = path.read_text(encoding='utf-8')
        if 'export async function up' not in content or 'export async function down' not in content:
            errors.append(f'Migration is not reversible: {path.name}')


def main() -> None:
    catalog = json.loads(CATALOG.read_text(encoding='utf-8'))
    sql = migration_source(MIGRATIONS)
    errors: list[str] = []
    validate_catalog(catalog, sql, errors)
    validate_hardening(sql, errors)
    if errors:
        for error in errors:
            print(f'FAIL: {error}')
        raise SystemExit(1)
    print(
        'PASS: physical model validated — '
        f'{catalog["entity_count"]} tables, {catalog["field_count"]} fields, '
        f'{len(load_fk_targets(GENERATOR))} foreign keys, indexed FK coverage and hardened grants.'
    )


if __name__ == '__main__':
    main()
