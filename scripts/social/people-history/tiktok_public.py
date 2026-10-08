"""Inventory a visible TikTok grid; candidates stay unverified and dates unknown."""
import argparse
import json
import re
import shutil
import subprocess
import time
from history_store import Store, WORKSPACE, now


def collect(run, session, person_id, account_url, minutes):
    store = Store(run)
    account = next(a for a in store.leads() if a['person_id'] == person_id and a['url'] == account_url)
    seen = {p['post_id'] for p in store.events('tiktok-visible-posts') if p['account_key'] == account['account_key']}
    stagnant = 0
    started = time.monotonic()
    status = 'PARTIAL_TIME_LIMIT'
    while time.monotonic() - started < minutes * 60:
        result = subprocess.run([shutil.which('npx.cmd'), '--yes', '--package', '@playwright/cli',
            'playwright-cli', '-s=' + session, 'run-code',
            '--filename=EcomicDataCenter/scripts/social/people-history/tiktok_visible.js'], cwd=WORKSPACE,
            capture_output=True, text=True, encoding='utf-8', errors='replace', timeout=60)
        if result.returncode or '### Result\n' not in result.stdout:
            status = 'PARTIAL_CLI_ERROR'
            break
        payload = result.stdout.split('### Result\n', 1)[1].split('\n### ', 1)[0]
        data = json.loads(payload)
        if data['url'].rstrip('/') != account_url.rstrip('/'):
            status = 'PARTIAL_NAVIGATION_CHANGED'
            break
        evidence = store.evidence(payload, {'source_url': account_url, 'platform': 'tiktok',
                                           'kind': 'VISIBLE_PUBLIC_GRID'})
        added = 0
        for post in data['posts']:
            if not post['url'].startswith(account_url + '/video/'):
                continue
            match = re.search(r'/video/(\d+)$', post['url'])
            if not match or match[1] in seen:
                continue
            seen.add(match[1])
            added += 1
            store.append('tiktok-visible-posts', {**post, 'post_id': match[1], 'person_id': person_id,
                'account_key': account['account_key'], 'identity_status': 'LEAD_UNVERIFIED',
                'captured_at': data['captured_at'], 'published_at': None,
                'date_precision': 'UNKNOWN', 'review_status': 'PENDING', 'evidence_sha256': evidence['sha256']})
        print(json.dumps({'unique_posts': len(seen), 'new_posts': added}), flush=True)
        if data['dialogs'] or re.search(r'captcha|verify|verifica', data['title'], re.I):
            status = 'PARTIAL_DIALOG_OR_CHALLENGE_REQUIRES_REVIEW'
            break
        stagnant = stagnant + 1 if added == 0 else 0
        if stagnant >= 3:
            status = 'PARTIAL_SCROLL_STALLED'
            break
    store.append('enumeration-attempts', {'platform': 'tiktok', 'person_id': person_id,
        'account_key': account['account_key'], 'status': status, 'unique_visible_posts': len(seen),
        'completed_at': now(), 'period_complete': False})
    print(status, flush=True)


if __name__ == '__main__':
    parser = argparse.ArgumentParser()
    parser.add_argument('--run', required=True)
    parser.add_argument('--session', required=True)
    parser.add_argument('--person-id', required=True)
    parser.add_argument('--account-url', required=True)
    parser.add_argument('--minutes', type=int, default=10)
    args = parser.parse_args()
    collect(args.run, args.session, args.person_id, args.account_url, args.minutes)
