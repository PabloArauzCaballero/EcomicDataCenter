#!/usr/bin/env python3
"""Derives the intelligence catalog entries from the migration SQL itself.

The baseline schemas were generated from the logical PlantUML model. The
intelligence layer is instead defined by its forward migrations, so the catalog
is regenerated from that SQL with the same parser the drift gate uses. Deriving
one artifact from the other is what keeps `validate_physical_model` meaningful
instead of asserting two hand-written files against each other.
"""
from __future__ import annotations

import json
from pathlib import Path

from physical_model_parser import migration_source, parse_fks, parse_tables


def write_utf8(path, content):
    """Writes UTF-8 with LF endings so generated files do not depend on the OS."""
    with open(path, 'w', encoding='utf-8', newline=chr(10)) as handle:
        handle.write(content)


ROOT = Path(__file__).resolve().parents[1]
MIGRATIONS = ROOT / 'src/database/migrations'
CATALOG = ROOT / 'docs/model/model-catalog.json'
DERIVED_SCHEMAS = ('intelligence', 'audit')


def build_tags(properties: dict[str, object], foreign_key: bool) -> str:
    tags: list[str] = []
    if properties['primary_key']:
        tags.append('PK')
    if foreign_key:
        tags.append('FK')
    if properties['unique']:
        tags.append('UQ')
    if properties['nullable']:
        tags.append('nullable')
    return ', '.join(tags)


def build_entity(
    schema: str,
    table: str,
    definition: dict[str, object],
    foreign_keys: dict[str, tuple[str, str, str]],
) -> dict[str, object]:
    fields = []
    for name, properties in definition['columns'].items():
        raw_type = str(properties['type'])
        catalog_type = 'bigint' if raw_type.startswith('bigint generated') else raw_type
        foreign_key = f'{schema}.{table}.{name}' in foreign_keys
        fields.append(
            {
                'package': schema,
                'table': table,
                'field': name,
                'type': catalog_type,
                'primary_key': properties['primary_key'],
                'foreign_key': foreign_key,
                'unique': properties['unique'],
                'nullable': properties['nullable'],
                'tags': build_tags(properties, foreign_key),
            }
        )
    uniques = sorted(
        f'UQ({", ".join(columns)})'
        for columns in definition['uniques']
        if len(columns) > 1
    )
    return {'package': schema, 'table': table, 'alias': table, 'fields': fields,
            'unique_constraints': uniques}


def reconcile_baseline_columns(
    baseline: list[dict[str, object]],
    tables: dict[tuple[str, str], dict[str, object]],
    foreign_keys: dict[str, tuple[str, str, str]],
) -> None:
    """Appends columns a later migration added to an existing baseline table.

    Baseline entities came from the logical PlantUML model, so their field order
    is preserved and nothing is removed here. Only columns introduced by a
    forward `ALTER TABLE` are appended, which is what keeps the drift gate green
    without hand-editing the catalog.
    """
    for entity in baseline:
        key = (str(entity['package']), str(entity['table']))
        definition = tables.get(key)
        if not definition:
            continue
        fields = entity['fields']
        assert isinstance(fields, list)
        known = {str(field['field']) for field in fields}
        columns = definition['columns']
        assert isinstance(columns, dict)
        for name, properties in columns.items():
            if name in known:
                continue
            foreign_key = f'{key[0]}.{key[1]}.{name}' in foreign_keys
            raw_type = str(properties['type'])
            fields.append(
                {
                    'package': key[0],
                    'table': key[1],
                    'field': name,
                    'type': 'bigint' if raw_type.startswith('bigint generated') else raw_type,
                    'primary_key': properties['primary_key'],
                    'foreign_key': foreign_key,
                    'unique': properties['unique'],
                    'nullable': properties['nullable'],
                    'tags': build_tags(properties, foreign_key),
                }
            )


def main() -> None:
    sql = migration_source(MIGRATIONS)
    tables = parse_tables(sql)
    foreign_keys = parse_fks(sql)
    catalog = json.loads(CATALOG.read_text(encoding='utf-8'))

    derived = [
        build_entity(schema, table, definition, foreign_keys)
        for (schema, table), definition in tables.items()
        if schema in DERIVED_SCHEMAS
    ]
    derived.sort(key=lambda entity: (DERIVED_SCHEMAS.index(entity['package']), entity['table']))

    baseline = [e for e in catalog['entities'] if e['package'] not in DERIVED_SCHEMAS]
    reconcile_baseline_columns(baseline, tables, foreign_keys)
    entities = baseline + derived
    packages: dict[str, int] = {}
    for entity in entities:
        packages[entity['package']] = packages.get(entity['package'], 0) + 1

    catalog['entities'] = entities
    catalog['packages'] = packages
    catalog['entity_count'] = len(entities)
    catalog['field_count'] = sum(len(entity['fields']) for entity in entities)
    write_utf8(CATALOG, json.dumps(catalog, indent=2, ensure_ascii=False) + '\n')
    print(
        f'PASS: catalog synchronised — {catalog["entity_count"]} tables, '
        f'{catalog["field_count"]} fields, {len(derived)} derived from migrations.'
    )


if __name__ == '__main__':
    main()
