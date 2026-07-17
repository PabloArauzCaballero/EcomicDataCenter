from __future__ import annotations

from collections import defaultdict
from pathlib import Path
import json
import re
import yaml

ROOT = Path(__file__).resolve().parents[1]
SPEC_PATH = ROOT / 'docs/endpoints/openapi.yaml'
OUTPUT_PATH = ROOT / 'docs/postman/collection.json'
HTTP_METHODS = {'get', 'post', 'put', 'patch', 'delete'}


def schema_example(schema: dict, components: dict, depth: int = 0):
    if depth > 8:
        return None
    if '$ref' in schema:
        name = schema['$ref'].rsplit('/', 1)[-1]
        return schema_example(components.get(name, {}), components, depth + 1)
    if 'example' in schema:
        return schema['example']
    if 'default' in schema:
        return schema['default']
    if 'enum' in schema and schema['enum']:
        return schema['enum'][0]

    schema_type = schema.get('type')
    if schema_type == 'object' or 'properties' in schema:
        required = set(schema.get('required', []))
        result = {}
        for name, property_schema in schema.get('properties', {}).items():
            if name in required or len(result) < 4:
                result[name] = schema_example(property_schema, components, depth + 1)
        return result
    if schema_type == 'array':
        return [schema_example(schema.get('items', {}), components, depth + 1)]
    if schema_type == 'integer':
        return schema.get('minimum', 1)
    if schema_type == 'number':
        return schema.get('minimum', 1.0)
    if schema_type == 'boolean':
        return True
    if schema.get('format') == 'uuid':
        return '00000000-0000-4000-8000-000000000001'
    if schema.get('format') == 'date':
        return '2026-01-31'
    if schema.get('format') == 'date-time':
        return '2026-01-31T12:00:00Z'
    return 'string'


def make_request(path: str, method: str, operation: dict, components: dict) -> dict:
    postman_path = re.sub(r'\{([^}]+)\}', r'{{\1}}', path)
    if postman_path.startswith('/api/v1'):
        base_variable = '{{apiBaseUrl}}'
        relative_path = postman_path.removeprefix('/api/v1') or '/'
    else:
        base_variable = '{{rootUrl}}'
        relative_path = postman_path
    request = {
        'method': method.upper(),
        'header': [],
        'url': {
            'raw': base_variable + relative_path,
            'host': [base_variable],
            'path': [part for part in relative_path.strip('/').split('/') if part],
        },
        'description': operation.get('description') or operation.get('summary') or '',
    }

    security = operation.get('security')
    if not security:
        request['auth'] = {'type': 'noauth'}
    else:
        request['auth'] = {
            'type': 'bearer',
            'bearer': [{'key': 'token', 'value': '{{accessToken}}', 'type': 'string'}],
        }

    parameters = operation.get('parameters', [])
    query = []
    for parameter in parameters:
        if parameter.get('in') == 'query':
            query.append({
                'key': parameter['name'],
                'value': str(parameter.get('example', '')),
                'disabled': not parameter.get('required', False),
            })
    if query:
        request['url']['query'] = query

    content = operation.get('requestBody', {}).get('content', {})
    media = content.get('application/json')
    if media:
        example = media.get('example')
        if example is None:
            example = schema_example(media.get('schema', {}), components)
        request['header'].append({'key': 'Content-Type', 'value': 'application/json'})
        request['body'] = {
            'mode': 'raw',
            'raw': json.dumps(example, ensure_ascii=False, indent=2),
            'options': {'raw': {'language': 'json'}},
        }

    return {
        'name': operation.get('summary') or operation['operationId'],
        'request': request,
        'response': [],
    }


def main() -> None:
    spec = yaml.safe_load(SPEC_PATH.read_text(encoding='utf-8'))
    components = spec.get('components', {}).get('schemas', {})
    groups: dict[str, list[dict]] = defaultdict(list)

    for path, path_item in spec.get('paths', {}).items():
        for method, operation in path_item.items():
            if method not in HTTP_METHODS:
                continue
            tag = (operation.get('tags') or ['Other'])[0]
            groups[tag].append(make_request(path, method, operation, components))

    collection = {
        'info': {
            '_postman_id': '5ca9ea63-822b-49a0-9f80-b84ae16dce81',
            'name': 'Observatorio Económico Core API',
            'description': 'Colección generada desde docs/endpoints/openapi.yaml. No contiene secretos.',
            'schema': 'https://schema.getpostman.com/json/collection/v2.1.0/collection.json',
        },
        'auth': {
            'type': 'bearer',
            'bearer': [{'key': 'token', 'value': '{{accessToken}}', 'type': 'string'}],
        },
        'variable': [
            {'key': 'rootUrl', 'value': 'http://localhost:8080'},
            {'key': 'apiBaseUrl', 'value': 'http://localhost:8080/api/v1'},
            {'key': 'accessToken', 'value': ''},
            {'key': 'id', 'value': '00000000-0000-4000-8000-000000000001'},
            {'key': 'observationId', 'value': '00000000-0000-4000-8000-000000000001'},
            {'key': 'revisionId', 'value': '00000000-0000-4000-8000-000000000001'},
        ],
        'item': [{'name': tag, 'item': items} for tag, items in sorted(groups.items())],
    }

    OUTPUT_PATH.parent.mkdir(parents=True, exist_ok=True)
    OUTPUT_PATH.write_text(json.dumps(collection, ensure_ascii=False, indent=2) + '\n', encoding='utf-8')
    print(f'PASS: generated Postman collection with {sum(len(items) for items in groups.values())} requests.')


if __name__ == '__main__':
    main()
