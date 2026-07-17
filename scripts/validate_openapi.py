from pathlib import Path
import sys
import yaml

ROOT = Path(__file__).resolve().parents[1]
path = ROOT / 'docs/endpoints/openapi.yaml'
spec = yaml.safe_load(path.read_text(encoding='utf-8'))
errors = []
if spec.get('openapi') != '3.0.3': errors.append('openapi must be 3.0.3')
paths = spec.get('paths', {})
operation_ids = []
for route, methods in paths.items():
    for method, operation in methods.items():
        if method not in {'get', 'post', 'put', 'patch', 'delete'}: continue
        operation_id = operation.get('operationId')
        if not operation_id: errors.append(f'{method.upper()} {route} lacks operationId')
        operation_ids.append(operation_id)
        if not operation.get('responses'): errors.append(f'{method.upper()} {route} lacks responses')
if len(operation_ids) != len(set(operation_ids)): errors.append('operationId values are not unique')
if len(paths) != 35: errors.append(f'expected 35 paths, found {len(paths)}')
for error in errors: print(f'FAIL: {error}')
if errors: sys.exit(1)
print(f'PASS: {len(paths)} paths and {len(operation_ids)} operations validated.')
