"""Reproduce el inventario de planificación; no navega ni recoge nuevos posts."""

import collections
import csv
import datetime as dt
import gzip
import hashlib
import io
import json
from pathlib import Path


DEST = Path(__file__).resolve().parent
CORE = DEST.parents[2]
WORKSPACE = CORE.parent
PEOPLE = WORKSPACE / '_publish_people_core/scripts/social/people'
PLATFORMS = ['facebook', 'instagram', 'tiktok', 'youtube', 'x', 'linkedin']
START = dt.datetime.fromisoformat('2021-10-08T00:00:00-04:00')
END = dt.datetime.fromisoformat('2026-10-08T00:00:00-04:00')


def read_json(path):
    return json.loads(path.read_text(encoding='utf-8'))


def write_json(name, value):
    (DEST / name).write_text(json.dumps(value, ensure_ascii=False, indent=2) + '\n', encoding='utf-8')


def write_csv(name, fields, rows):
    with (DEST / name).open('w', encoding='utf-8-sig', newline='') as stream:
        writer = csv.DictWriter(stream, fieldnames=fields, lineterminator='\n')
        writer.writeheader()
        writer.writerows(rows)


def sha256(path):
    return hashlib.sha256(path.read_bytes()).hexdigest()


def main():
    source = PEOPLE / 'research-300.json'
    research = read_json(source)
    people = research['people']
    pilot = read_json(PEOPLE / 'pilot-3.json')
    reviewed = read_json(PEOPLE / 'reviewed-pilot-accounts.json')
    company_path = CORE / 'src/database/seeds/boot/company-social.json'
    company = read_json(company_path)
    ids = [p['slug'] for p in people]
    assert len(ids) == len(set(ids)) == 300, 'Padrón distinto de 300 identidades únicas'

    windows = []
    cursor = START
    while cursor < END:
        following = cursor.replace(year=cursor.year + 1, month=1) if cursor.month == 12 else cursor.replace(month=cursor.month + 1)
        following = min(following, END)
        windows.append({
            'window_id': f'W{len(windows) + 1:02d}',
            'start_inclusive': cursor.isoformat(),
            'end_exclusive': following.isoformat(),
            'timezone': 'America/La_Paz',
            'days': (following - cursor).days,
        })
        cursor = following
    assert len(windows) == 60 and sum(w['days'] for w in windows) == 1826
    assert all(a['end_exclusive'] == b['start_inclusive'] for a, b in zip(windows, windows[1:]))

    roster = []
    leads = []
    discovery = []
    for person in people:
        person_id = person['slug']
        roster.append({
            'person_id': person_id, 'name': person['name'], 'sector': person['sector'],
            'identity_status_in_roster': person.get('identityReview'),
            'age_status_in_roster': person.get('ageReview'),
            'account_status_in_roster': person.get('accountVerification'),
            'account_leads_count': len(person.get('accountLeads', [])),
            'separate_pilot_review_exists': person_id in reviewed,
            'new_review_status': 'PENDING',
            'inclusion_sources_json': json.dumps(person.get('evidence', []), ensure_ascii=False),
        })
        for index, lead in enumerate(person.get('accountLeads', []), 1):
            leads.append({
                'lead_id': f'{person_id}_L{index:02d}', 'person_id': person_id,
                'platform': lead.get('platform'), 'url': lead.get('url'),
                'source_url': lead.get('sourceUrl'), 'source_status': lead.get('status'),
                'new_verification_status': 'PENDING',
            })
        for platform in PLATFORMS:
            discovery.append({
                'task_id': f'{person_id}:{platform}', 'person_id': person_id,
                'platform': platform, 'account_id': None, 'status': 'PENDING',
                'existing_leads_count': sum(x.get('platform') == platform for x in person.get('accountLeads', [])),
                'source_url': None, 'reviewed_at': None,
            })

    write_csv('roster.csv', list(roster[0]), roster)
    write_csv('account-leads.csv', list(leads[0]), leads)
    write_csv('discovery-tasks.csv', list(discovery[0]), discovery)
    write_csv('windows.csv', list(windows[0]), windows)

    coverage_fields = [
        'task_id', 'person_id', 'platform', 'account_id', 'window_id',
        'start_inclusive', 'end_exclusive', 'access_status', 'enumeration_status',
        'review_status', 'posts_discovered', 'posts_captured', 'posts_reviewed',
        'universe_count', 'evidence_ref', 'gap_reason',
    ]
    with (DEST / 'coverage-initial.csv.gz').open('wb') as binary:
        with gzip.GzipFile(filename='', mode='wb', fileobj=binary, mtime=0) as zipped:
            with io.TextIOWrapper(zipped, encoding='utf-8-sig', newline='') as stream:
                writer = csv.DictWriter(stream, fieldnames=coverage_fields, lineterminator='\n')
                writer.writeheader()
                for task in discovery:
                    for window in windows:
                        writer.writerow({
                            'task_id': f"{task['task_id']}:{window['window_id']}",
                            'person_id': task['person_id'], 'platform': task['platform'],
                            'account_id': None, 'window_id': window['window_id'],
                            'start_inclusive': window['start_inclusive'],
                            'end_exclusive': window['end_exclusive'],
                            'access_status': 'PENDING', 'enumeration_status': 'NOT_STARTED',
                            'review_status': 'PENDING',
                        })

    scope = {
        'status': 'PLANNING_ONLY_NO_NEW_POSTS_COLLECTED', 'prepared_on': '2026-10-08',
        'start_inclusive': START.isoformat(), 'end_exclusive': END.isoformat(),
        'timezone': 'America/La_Paz', 'days': (END - START).days,
        'operational_windows': 60, 'intersected_calendar_months': 61,
        'people': 300, 'platforms': PLATFORMS, 'discovery_tasks': 1800,
        'planning_cells': 108000, 'known_account_count': None,
        'counts_are_posts': False, 'counts_are_confirmed_accounts': False,
        'expand_after_account_verification': 'one child task per actual account and applicable surface',
        'comments_scope': 'PROPOSED_AGGREGATED_WITHOUT_AUTHOR_IDENTIFIERS_AWAITING_PREFERENCE',
        'review_method': 'individual AI review for every recovered post; explicit human adjudication and quality audit',
        'audiovisual_requirement': 'all applicable media; full time coverage or explicitly partial',
        'paid_access': 'not purchased; historical workflow preferred no paid APIs',
        'unknown_csv_values': 'empty cells mean unknown, never zero',
        'human_review_of_every_post': 'not assumed; requires separate capacity estimate',
    }
    write_json('scope.json', scope)
    baseline = {
        'inspection_date': '2026-10-08', 'roster_generated_at': research.get('generatedAt'),
        'roster_status': research.get('status'), 'people': len(people), 'unique_ids': len(set(ids)),
        'sectors': dict(collections.Counter(p['sector'] for p in people)),
        'status_counts': {field: dict(collections.Counter(p.get(field) for p in people)) for field in ['identityReview', 'ageReview', 'accountVerification']},
        'people_with_account_leads': sum(bool(p.get('accountLeads')) for p in people),
        'people_without_account_leads': sum(not p.get('accountLeads') for p in people),
        'account_leads': len(leads), 'separately_reviewed_pilot_accounts': len(reviewed),
        'pilot': {
            'people': len(pilot['people']), 'posts': sum(p['postsInWindow'] for p in pilot['people']),
            'window_start': pilot['windowStart'], 'window_end': pilot['windowEnd'],
            'coverage': pilot['coverage'],
        },
        'company_local_snapshot': {'profiles': len(company['profiles']), 'posts': len(company['posts']), 'deployment_verified': False},
        'source_files': [{
            'path': str(path.relative_to(WORKSPACE)).replace('\\', '/'),
            'sha256': sha256(path),
        } for path in [source, PEOPLE / 'pilot-3.json', PEOPLE / 'reviewed-pilot-accounts.json', company_path]],
    }
    write_json('baseline.json', baseline)

    task_keys = set()
    with gzip.open(DEST / 'coverage-initial.csv.gz', 'rt', encoding='utf-8-sig', newline='') as stream:
        for row in csv.DictReader(stream):
            assert row['task_id'] not in task_keys
            task_keys.add(row['task_id'])
            assert row['person_id'] in ids and row['platform'] in PLATFORMS
            assert row['access_status'] == row['review_status'] == 'PENDING'
            assert row['enumeration_status'] == 'NOT_STARTED'
            assert all(row[k] == '' for k in ['account_id', 'posts_discovered', 'posts_captured', 'posts_reviewed', 'universe_count', 'evidence_ref'])
    assert len(task_keys) == 108000
    assert len(discovery) == len({row['task_id'] for row in discovery}) == 1800
    assert len(leads) == 130
    assert baseline['pilot']['posts'] == 73
    outputs = ['roster.csv', 'account-leads.csv', 'discovery-tasks.csv', 'windows.csv', 'coverage-initial.csv.gz', 'scope.json', 'baseline.json']
    validation = {
        'status': 'PASS', 'planning_only': True, 'new_posts_collected': 0,
        'checks': ['300 unique people', '130 existing leads', '1800 unique discovery tasks', '60 adjacent windows covering exactly 1826 days', '108000 unique pending coverage cells', 'unknown counts remain empty', 'pilot total is 73 posts'],
        'outputs': [{'file': name, 'bytes': (DEST / name).stat().st_size, 'sha256': sha256(DEST / name)} for name in outputs],
    }
    write_json('validation.json', validation)
    print(json.dumps({'status': 'PASS', 'people': len(people), 'leads': len(leads), 'windows': len(windows), 'coverage_cells': len(task_keys), 'new_posts_collected': 0}))


if __name__ == '__main__':
    main()
