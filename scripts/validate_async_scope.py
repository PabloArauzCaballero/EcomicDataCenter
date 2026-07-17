#!/usr/bin/env python3
from pathlib import Path
import json
import sys

ROOT = Path(__file__).resolve().parents[1]

def fail(message: str) -> None:
    print(f'FAIL: {message}')
    sys.exit(1)

package = json.loads((ROOT / 'package.json').read_text())
dependencies = {**package.get('dependencies', {}), **package.get('devDependencies', {})}
for forbidden in ['bullmq', 'bull', 'pg-boss', 'amqplib', 'kafkajs']:
    if forbidden in dependencies:
        fail(f'unapproved queue dependency present: {forbidden}')

workers = [path for path in (ROOT / 'src').rglob('*') if path.is_file() and 'worker' in path.name.lower()]
if workers:
    fail('worker files exist without an approved asynchronous contract')

adr = (ROOT / 'docs/decisions/0003-no-queue-initially.md').read_text()
assessment = (ROOT / 'docs/architecture/async-processing-assessment.md').read_text()
required = ['Estado: aceptado', 'lote máximo de 500', 'proceso persistente separado del API']
combined = adr + '\n' + assessment
missing = [token for token in required if token not in combined]
if missing:
    fail('async decision misses: ' + ', '.join(missing))
print('PASS: asynchronous scope is explicitly deferred; no queue or pseudo-worker was introduced.')
