#!/usr/bin/env python3
from pathlib import Path
import re
import sys

ROOT = Path(__file__).resolve().parents[1]

def fail(message: str) -> None:
    print(f'FAIL: {message}')
    sys.exit(1)

registration = (ROOT / 'src/modules/ingestion/observation-registration.service.ts').read_text()
batch = (ROOT / 'src/modules/ingestion/batch-import.service.ts').read_text()
repository = (ROOT / 'src/modules/ingestion/observation-write.repository.ts').read_text()
normalizer = (ROOT / 'src/modules/ingestion/observation-normalizer.ts').read_text()
schema = (ROOT / 'src/modules/ingestion/observation-input.schemas.ts').read_text()
migrations = '\n'.join(path.read_text() for path in sorted((ROOT / 'src/database/migrations').glob('*.ts')))

checks = {
    'manual batch-code idempotency': 'manualRequestFingerprint(input)' in registration and 'replayRegistration' in registration,
    'bulk batch-code idempotency': 'batchRequestFingerprint(input)' in batch and 'replayBatchImport' in batch,
    'partial batch savepoints': 'ROLLBACK TO SAVEPOINT' in batch and 'RELEASE SAVEPOINT' in batch,
    'provenance ownership': 'source.organizationId !== organizationId' in repository,
    'dataset/source consistency': 'dataset.sourceId !== source.sourceId' in repository,
    'revision metadata hash': all(token in normalizer for token in ['publicationDate', 'vintageDate', 'revisionReason']),
    'bounded bulk input': re.search(r'records: z\.array\(observationRecordSchema\)\.min\(1\)\.max\(500\)', schema) is not None,
    'durable replay columns': all(token in migrations for token in ['request_fingerprint', 'result_json']),
}
missing = [name for name, passed in checks.items() if not passed]
if missing:
    fail('missing use-case controls: ' + ', '.join(missing))
print(f'PASS: {len(checks)} core use-case controls validated.')
