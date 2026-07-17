#!/usr/bin/env python3
from pathlib import Path
import sys
import yaml

ROOT = Path(__file__).resolve().parents[1]

def fail(message: str) -> None:
    print(f'FAIL: {message}')
    sys.exit(1)

auth = (ROOT / 'src/common/auth/jwt-auth.guard.ts').read_text()
claims = (ROOT / 'src/common/auth/token-claims.parser.ts').read_text()
environment = (ROOT / 'src/config/environment.ts').read_text()
main = (ROOT / 'src/main.ts').read_text()
spec = yaml.safe_load((ROOT / 'docs/endpoints/openapi.yaml').read_text())

checks = {
    'RS256 allowlist': "algorithms: ['RS256']" in auth,
    'issuer and audience': all(token in auth for token in ['issuer:', 'audience:']),
    'JWKS limits': all(token in auth for token in ['rateLimit: true', 'timeout: 5_000', 'cacheMaxAge']),
    'organization UUID': 'z.string().uuid()' in claims,
    'production auth deny': "AUTH_MODE=disabled is forbidden in production" in environment,
    'CORS allowlist': 'origins.length ? origins : false' in main,
    'body limit': 'bodyLimit: environment.BODY_LIMIT_BYTES' in main,
    'rate limit': 'app.register(rateLimit' in main,
}
missing = [name for name, passed in checks.items() if not passed]
if missing:
    fail('missing security controls: ' + ', '.join(missing))

for path, item in spec['paths'].items():
    for method, operation in item.items():
        if method not in {'get', 'post', 'put', 'patch', 'delete'}:
            continue
        if path not in {'/health', '/ready', '/metrics'} and operation.get('security') != [{'bearerAuth': []}]:
            fail(f'{method.upper()} {path} is not default-deny')
        for status in ['400', '401', '403', '409', '422', '429', '500', '503']:
            if status not in operation['responses']:
                fail(f'{method.upper()} {path} misses response {status}')

register = spec['components']['schemas']['RegisterObservationInput']
if 'batchCode' not in register.get('required', []):
    fail('RegisterObservationInput does not require batchCode')
print(f"PASS: {len(checks)} security controls and {len(spec['paths'])} OpenAPI paths validated.")
