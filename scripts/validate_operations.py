#!/usr/bin/env python3
from pathlib import Path
import json
import sys

ROOT = Path(__file__).resolve().parents[1]

def fail(message: str) -> None:
    print(f'FAIL: {message}')
    sys.exit(1)

compose = (ROOT / 'docker-compose.yml').read_text()
dockerfile = (ROOT / 'Dockerfile').read_text()
nginx = (ROOT / 'infra/nginx/nginx.conf').read_text()
environment = (ROOT / 'src/config/environment.ts').read_text()
metrics = (ROOT / 'src/common/observability/metrics.service.ts').read_text()
backup = (ROOT / 'infra/backup/run-backup.sh').read_text()
backup_grants = (ROOT / 'src/database/migrations/0016-grant-backup-operator.ts').read_text()
restore = (ROOT / 'infra/backup/restore-drill.sh').read_text()

checks = {
    'single public service': 'ports:\n      - "8080:8080"' in compose and 'expose: ["3000"]' in compose,
    'internal app network': 'internal: true' in compose,
    'non-root runtime': 'USER observatory' in dockerfile,
    'read-only API': 'read_only: true' in compose and 'cap_drop: [ALL]' in compose,
    'metrics hidden at edge': 'location = /metrics' in nginx and 'return 404' in nginx,
    'backup isolated': 'profiles: ["operations"]' in compose and 'run-backup.sh' in compose,
    'backup checksum': 'sha256sum' in backup,
    'backup read grants': all(token in backup_grants for token in ['GRANT SELECT ON ALL TABLES', 'REVOKE CREATE ON SCHEMA']),
    'restore checksum': 'sha256sum -c' in restore,
    'restore smoke': 'BEGIN READ ONLY' in restore,
    'backup env validation': all(token in environment for token in ['BACKUP_ENABLED', 'BACKUP_STRATEGY', 'BACKUP_RETENTION_DAYS']),
    'operational ingestion metric': 'observatory_ingestion_records_total' in metrics,
}
missing = [name for name, passed in checks.items() if not passed]
if missing:
    fail('missing operational controls: ' + ', '.join(missing))
if not (ROOT / 'test/load/query-baseline.k6.js').exists():
    fail('k6 baseline is missing')
lock_status = 'present' if (ROOT / 'yarn.lock').exists() else 'BLOCKED: yarn.lock missing'
print(f"PASS: {len(checks)} operational controls validated; release reproducibility is {lock_status}.")
