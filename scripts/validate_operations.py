#!/usr/bin/env python3
from pathlib import Path
import sys
import yaml

ROOT = Path(__file__).resolve().parents[1]


def fail(message: str) -> None:
    print(f'FAIL: {message}')
    sys.exit(1)


compose_path = ROOT / 'docker-compose.yml'
compose = yaml.safe_load(compose_path.read_text())
services = compose.get('services', {})
nginx_service = services.get('nginx', {})
api_service = services.get('api', {})
backup_service = services.get('backup', {})
networks = compose.get('networks', {})

dockerfile = (ROOT / 'Dockerfile').read_text()
nginx = (ROOT / 'infra/nginx/nginx.conf').read_text()
environment = (ROOT / 'src/config/environment.ts').read_text()
metrics = (ROOT / 'src/common/observability/metrics.service.ts').read_text()
backup = (ROOT / 'infra/backup/run-backup.sh').read_text()
backup_grants = (ROOT / 'src/database/migrations/0016-grant-backup-operator.ts').read_text()
restore = (ROOT / 'infra/backup/restore-drill.sh').read_text()

public_port_services = [
    service_name
    for service_name, service in services.items()
    if service.get('ports')
]

checks = {
    'single public service': public_port_services == ['nginx']
    and '8080:8080' in nginx_service.get('ports', [])
    and '3000' in api_service.get('expose', []),
    'internal app network': networks.get('app', {}).get('internal') is True,
    'non-root runtime': 'USER observatory' in dockerfile,
    'read-only API': api_service.get('read_only') is True and 'ALL' in api_service.get('cap_drop', []),
    'metrics hidden at edge': 'location = /metrics' in nginx and 'return 404' in nginx,
    'backup isolated': 'operations' in backup_service.get('profiles', [])
    and 'run-backup.sh' in ' '.join(backup_service.get('entrypoint', [])),
    'backup checksum': 'sha256sum' in backup,
    'backup read grants': all(
        token in backup_grants for token in ['GRANT SELECT ON ALL TABLES', 'REVOKE CREATE ON SCHEMA']
    ),
    'restore checksum': 'sha256sum -c' in restore,
    'restore smoke': 'BEGIN READ ONLY' in restore,
    'backup env validation': all(
        token in environment
        for token in ['BACKUP_ENABLED', 'BACKUP_STRATEGY', 'BACKUP_RETENTION_DAYS']
    ),
    'operational ingestion metric': 'observatory_ingestion_records_total' in metrics,
}
missing = [name for name, passed in checks.items() if not passed]
if missing:
    fail('missing operational controls: ' + ', '.join(missing))
if not (ROOT / 'test/load/query-baseline.k6.js').exists():
    fail('k6 baseline is missing')
lock_status = 'present' if (ROOT / 'yarn.lock').exists() else 'BLOCKED: yarn.lock missing'
print(f"PASS: {len(checks)} operational controls validated; release reproducibility is {lock_status}.")
