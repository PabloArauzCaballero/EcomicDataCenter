from __future__ import annotations

from pathlib import Path
import re
import sys
import yaml

ROOT = Path(__file__).resolve().parents[1]
CONTROLLERS = list((ROOT / 'src/modules').glob('*/*.controller.ts'))
SPEC = yaml.safe_load((ROOT / 'docs/endpoints/openapi.yaml').read_text(encoding='utf-8'))
HTTP_DECORATORS = {'Get': 'get', 'Post': 'post', 'Put': 'put', 'Patch': 'patch', 'Delete': 'delete'}


def normalize(path: str) -> str:
    path = re.sub(r':([A-Za-z0-9_]+)', r'{\1}', path)
    return '/' + '/'.join(segment for segment in path.strip('/').split('/') if segment)


def controller_routes() -> set[tuple[str, str]]:
    routes: set[tuple[str, str]] = set()
    for path in CONTROLLERS:
        text = path.read_text(encoding='utf-8')
        controller = re.search(r"@Controller\((?:'([^']*)'|\)?)", text)
        prefix = controller.group(1) if controller and controller.group(1) else ''
        for match in re.finditer(r"@(Get|Post|Put|Patch|Delete)\((?:'([^']*)')?\)", text):
            method = HTTP_DECORATORS[match.group(1)]
            suffix = match.group(2) or ''
            route = normalize(f'/{prefix}/{suffix}')
            if route not in {'/health', '/ready', '/metrics'}:
                route = normalize(f'/api/v1/{route}')
            routes.add((method, route))
    return routes


def openapi_routes() -> set[tuple[str, str]]:
    routes: set[tuple[str, str]] = set()
    for route, operations in SPEC.get('paths', {}).items():
        for method in operations:
            if method in HTTP_DECORATORS.values():
                routes.add((method, normalize(route)))
    return routes


def main() -> None:
    source = controller_routes()
    contract = openapi_routes()
    missing = sorted(source - contract)
    stale = sorted(contract - source)
    for method, route in missing:
        print(f'FAIL: source route missing from OpenAPI: {method.upper()} {route}')
    for method, route in stale:
        print(f'FAIL: OpenAPI route missing from source: {method.upper()} {route}')
    if missing or stale:
        sys.exit(1)
    print(f'PASS: {len(source)} controller routes match OpenAPI.')


if __name__ == '__main__':
    main()
