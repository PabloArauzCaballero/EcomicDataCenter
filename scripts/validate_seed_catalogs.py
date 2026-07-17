#!/usr/bin/env python3
"""Static gate for the two permitted persistent seed catalogs."""
from __future__ import annotations

import json
import re
import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
SEEDS = ROOT / 'src' / 'database' / 'seeds'
UUID = re.compile(r'^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$')
SENSITIVE = {'password', 'secret', 'token', 'apiKey', 'api_key', 'privateKey', 'private_key'}
IDENTITY_KEYS = {
    'frequencyId', 'qualityDimensionId', 'unitMeasureId', 'organizationId',
    'statisticalDomainId', 'sourceId', 'sourceArtifactId', 'conceptId',
    'codeListId', 'codeItemId', 'methodologyId', 'methodologyVersionId',
    'dataStructureId', 'dimensionDefinitionId', 'measureDefinitionId',
    'datasetId', 'datasetVersionId', 'indicatorId', 'indicatorVersionId',
}


def collect_ids(value: object) -> list[str]:
    found: list[str] = []
    if isinstance(value, dict):
        for key, entry in value.items():
            if key in IDENTITY_KEYS and isinstance(entry, str) and UUID.match(entry):
                found.append(entry)
            found.extend(collect_ids(entry))
    elif isinstance(value, list):
        for entry in value:
            found.extend(collect_ids(entry))
    return found


def find_sensitive(value: object, path: str = '$') -> list[str]:
    errors: list[str] = []
    if isinstance(value, dict):
        for key, entry in value.items():
            if key in SENSITIVE:
                errors.append(f'{path}.{key}')
            errors.extend(find_sensitive(entry, f'{path}.{key}'))
    elif isinstance(value, list):
        for index, entry in enumerate(value):
            errors.extend(find_sensitive(entry, f'{path}[{index}]'))
    return errors


def main() -> int:
    expected_dirs = {'boot', 'mock', 'runners', 'schemas', 'tests'}
    actual_dirs = {path.name for path in SEEDS.iterdir() if path.is_dir()}
    unexpected = sorted(actual_dirs - expected_dirs)
    if unexpected:
        print(f'FAIL: unexpected persistent seed categories: {unexpected}')
        return 1

    sql_files = list(SEEDS.rglob('*.sql'))
    if sql_files:
        print('FAIL: SQL seed files are forbidden')
        return 1

    json_files = sorted(SEEDS.glob('boot/*.json')) + sorted(SEEDS.glob('mock/*.json'))
    if len(json_files) != 4:
        print(f'FAIL: expected 4 seed JSON files, found {len(json_files)}')
        return 1

    all_ids: list[str] = []
    for path in json_files:
        payload = json.loads(path.read_text(encoding='utf-8'))
        sensitive = find_sensitive(payload)
        if sensitive:
            print(f'FAIL: sensitive-looking keys in {path.name}: {sensitive}')
            return 1
        identities = collect_ids(payload)
        if path.name == 'observatory-demo.json':
            identities.remove(payload['source']['frequencyId'])
        all_ids.extend(identities)

    duplicates = sorted({identifier for identifier in all_ids if all_ids.count(identifier) > 1})
    if duplicates:
        print(f'FAIL: duplicate stable UUIDs across seed catalogs: {duplicates}')
        return 1

    mock = json.loads((SEEDS / 'mock' / 'observatory-demo.json').read_text(encoding='utf-8'))
    if not mock['organization']['code'].startswith('DEMO-'):
        print('FAIL: mock organization is not visibly synthetic')
        return 1
    if not mock['artifact']['storageUri'].startswith('mock://'):
        print('FAIL: mock artifact does not use mock://')
        return 1
    if mock['artifact']['metadataJson'].get('synthetic') is not True:
        print('FAIL: mock artifact lacks synthetic=true')
        return 1

    runner = (SEEDS / 'runners' / 'run-mock-seeds.ts').read_text(encoding='utf-8')
    if "environment.NODE_ENV === 'production'" not in runner or 'Mock seeds are forbidden in production' not in runner:
        print('FAIL: production rejection guard is missing')
        return 1

    print(f'PASS: exactly two seed catalogs validated — 3 boot files, 1 synthetic mock file, {len(all_ids)} stable UUIDs.')
    return 0


if __name__ == '__main__':
    sys.exit(main())
