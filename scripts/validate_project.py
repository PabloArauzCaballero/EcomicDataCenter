from pathlib import Path
import json
import re
import sys

ROOT = Path(__file__).resolve().parents[1]
errors = []
required = [
    'package.json', '.env.example', 'Dockerfile', 'docker-compose.yml',
    'docs/endpoints/openapi.yaml', 'docs/endpoints/endpoints.md',
    'docs/progress/progress-report.md', 'docs/implementation/implementation-plan.md',
    'docs/data-model/data-model.pdf', 'src/main.ts',
]
for item in required:
    if not (ROOT / item).exists(): errors.append(f'missing {item}')

catalog = json.loads((ROOT / 'docs/model/model-catalog.json').read_text(encoding='utf-8'))
models = list((ROOT / 'src/database/models').glob('*.model.ts'))
if len(catalog['entities']) != 40: errors.append('catalog does not contain 40 entities')
if len(models) != 40: errors.append(f'expected 40 Sequelize models, found {len(models)}')

migration_text = '\n'.join(path.read_text(encoding='utf-8') for path in sorted((ROOT / 'src/database/migrations').glob('*.ts')))
for schema in ['provenance', 'semantic', 'metadata', 'statistics', 'quality_lineage', 'read_models']:
    if f'CREATE SCHEMA IF NOT EXISTS {schema}' not in migration_text:
        errors.append(f'migration does not create schema {schema}')
if re.search(r'CREATE\s+(?:TABLE|VIEW|TYPE|FUNCTION)\s+public\.', migration_text, re.I):
    errors.append('application object created in public schema')

source_text = '\n'.join(path.read_text(encoding='utf-8') for path in (ROOT / 'src').rglob('*.ts'))
if 'console.log' in source_text: errors.append('console.log found in runtime source')
for marker in ['TODO', 'FIXME', 'Not implemented']:
    if marker in source_text: errors.append(f'{marker} marker found in runtime source')

for json_path in ROOT.rglob('*.json'):
    if 'node_modules' in json_path.parts:
        continue
    try: json.loads(json_path.read_text(encoding='utf-8'))
    except Exception as error: errors.append(f'invalid JSON {json_path.relative_to(ROOT)}: {error}')

for error in errors: print(f'FAIL: {error}')
if errors: sys.exit(1)
print(f'PASS: project structure, 40 models, schemas, JSON and source markers validated.')
