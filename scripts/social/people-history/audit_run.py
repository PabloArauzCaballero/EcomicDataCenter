"""Audit local evidence and exports; a passing audit never means historical completion."""
import argparse
import csv
import gzip
import json
import platform
from history_store import Store, digest, load, now


def audit(run):
    store = Store(run)
    ledgers = {p.stem: store.events(p.stem) for p in store.path.glob('*.jsonl')}
    people = load(store.path / 'people.json')['people']
    person_ids = {r['slug'] for r in people}
    assert len(person_ids) == len(people) == 300
    files = {}
    for evidence in ledgers['evidence-index']:
        path = (store.path / evidence['file']).resolve()
        assert path.is_relative_to(store.path.resolve())
        if evidence['sha256'] not in files:
            raw = gzip.decompress(path.read_bytes())
            assert digest(raw) == evidence['sha256']
            files[evidence['sha256']] = len(raw)
        assert files[evidence['sha256']] == evidence['bytes']
    known = set(files)
    for name, rows in ledgers.items():
        for row in rows:
            if row.get('person_id'):
                assert row['person_id'] in person_ids, (name, row['person_id'])
            if row.get('evidence_sha256'):
                assert row['evidence_sha256'] in known, (name, row['evidence_sha256'])
    annotations = {r['post_id']: r for r in ledgers['text-reviews']}
    assert all(not r['audiovisual_review_complete'] and not r['full_post_review_complete'] for r in annotations.values())
    with gzip.open(store.path / 'exports/coverage-execution.csv.gz', 'rt', encoding='utf-8-sig', newline='') as stream:
        coverage = list(csv.DictReader(stream))
    assert len(coverage) == 108000
    assert len({(r['person_id'], r['platform'], r['window_id']) for r in coverage}) == 108000
    assert all(r['posts_in_period_total'] == '' and r['review_status'] == 'INCOMPLETE' for r in coverage)
    with gzip.open(store.path / 'exports/account-coverage.csv.gz', 'rt', encoding='utf-8-sig', newline='') as stream:
        account_coverage = list(csv.DictReader(stream))
    assert len({(r['person_id'], r['account_key'], r['window_id']) for r in account_coverage}) == len(account_coverage)
    assert all(r['posts_in_period_total'] == '' for r in account_coverage)
    dated = {r['post_id']: r for r in ledgers.get('post-date-evidence', [])}
    expected = sum(r['window_membership'] == 'IN_WINDOW' for r in dated.values())
    assert sum(int(r['observed_dated_posts']) for r in account_coverage) == expected
    search_rows = [row for p in store.path.glob('web-discovery-*.json') for row in load(p)['rows']]
    assert len({r['person_id'] for r in search_rows}) == len(search_rows)
    assert all(r['person_id'] in person_ids for r in search_rows)
    exports = []
    for path in sorted((store.path / 'exports').rglob('*')):
        if path.is_file():
            data = path.read_bytes()
            exports.append({'file': str(path.relative_to(store.path)), 'sha256': digest(data), 'bytes': len(data)})
    result = {'audited_at': now(), 'integrity_status': 'PASS', 'research_completion_status': 'INCOMPLETE',
              'python': platform.python_version(), 'people': len(people), 'search_attempts': len(search_rows),
              'individual_text_reviews': len(annotations), 'unique_evidence_files': len(files),
              'evidence_uncompressed_bytes': sum(files.values()), 'coverage_cells': len(coverage),
              'account_window_rows': len(account_coverage), 'confirmed_dated_posts_in_window': expected,
              'ledger_files': len(ledgers), 'exports': exports,
              'limitations': ['Hashes verify stored bytes, not truth of source content.',
                              'Automated text annotation is not audiovisual or human review.',
                              'No complete historical window has been demonstrated.']}
    store.snapshot('integrity-audit.json', result)
    print(json.dumps({k:v for k,v in result.items() if k not in ('exports','limitations')}))


if __name__ == '__main__':
    parser = argparse.ArgumentParser()
    parser.add_argument('--run', required=True)
    audit(parser.parse_args().run)
