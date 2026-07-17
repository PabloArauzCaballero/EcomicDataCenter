#!/usr/bin/env python3
"""Static phase-5 gate for reader/writer isolation and repository boundaries."""
from pathlib import Path
import re
import sys

ROOT = Path(__file__).resolve().parents[1]
SRC = ROOT / 'src'


def main() -> int:
    violations: list[str] = []
    factory = (SRC / 'database' / 'database.factory.ts').read_text(encoding='utf-8')
    reader_match = re.search(r'export function createReaderDatabase[\s\S]+?\n}', factory)
    if not reader_match:
        violations.append('createReaderDatabase is missing')
    elif 'models:' in reader_match.group(0):
        violations.append('reader Sequelize instance must not register static ORM models')

    for controller in SRC.glob('modules/**/*.controller.ts'):
        text = controller.read_text(encoding='utf-8')
        if 'QueryTypes' in text or '.query(' in text or 'database/models' in text:
            violations.append(f'{controller.relative_to(ROOT)} contains persistence details')

    query_repositories = list(SRC.glob('modules/query/*.repository.ts'))
    for repository in query_repositories:
        text = repository.read_text(encoding='utf-8')
        if 'ReadQueryExecutor' not in text:
            violations.append(f'{repository.relative_to(ROOT)} bypasses ReadQueryExecutor')
        if 'WRITER_DATABASE' in text:
            violations.append(f'{repository.relative_to(ROOT)} uses writer for read projection')

    write_repositories = list(SRC.glob('modules/**/*.repository.ts'))
    for repository in write_repositories:
        if repository.parent.name == 'query':
            continue
        text = repository.read_text(encoding='utf-8')
        if 'READER_DATABASE' in text:
            violations.append(f'{repository.relative_to(ROOT)} uses reader for command persistence')

    retry = (SRC / 'common' / 'persistence' / 'serializable-retry.ts').read_text(encoding='utf-8')
    for code in ('40001', '40P01'):
        if code not in retry:
            violations.append(f'serializable retry policy lacks PostgreSQL code {code}')

    if violations:
        print('Persistence validation failed:')
        for violation in violations:
            print(f'- {violation}')
        return 1
    print(f'PASS: reader/writer isolation, {len(query_repositories)} query repositories and bounded transaction retry validated.')
    return 0


if __name__ == '__main__':
    sys.exit(main())
