"""Capture visible own posts from an already-open, corroborated Facebook page.

Uses the Playwright CLI skill's browser. Never logs in or resolves challenges.
Stalling and the operational time limit are partial stops, never completeness.
"""
import argparse
import json
import re
import shutil
import subprocess
import time
from history_store import Store, WORKSPACE, now


def collect(run, session, person_id, account_url, minutes):
    store = Store(run)
    accounts = [a for a in store.leads() if a['person_id'] == person_id and a['url'] == account_url]
    confirmed = {a['account_key'] for a in store.events('account-reviews') if a['status'] == 'CORROBORATED'}
    if len(accounts) != 1 or accounts[0]['account_key'] not in confirmed:
        raise ValueError('Exact corroborated account required')
    account = accounts[0]
    seen = {p['post_id'] for p in store.events('facebook-visible-posts') if p['account_key'] == account['account_key']}
    started = time.monotonic()
    stagnant = 0
    status = 'PARTIAL_TIME_LIMIT'
    while time.monotonic() - started < minutes * 60:
        result = subprocess.run([shutil.which('npx.cmd'), '--yes', '--package', '@playwright/cli',
            'playwright-cli', '-s=' + session, 'run-code',
            '--filename=EcomicDataCenter/scripts/social/people-history/facebook_visible.js'], cwd=WORKSPACE,
            capture_output=True, text=True, encoding='utf-8', errors='replace', timeout=60)
        if result.returncode or '### Result\n' not in result.stdout:
            status = 'PARTIAL_CLI_ERROR'
            store.append('access-incidents', {'platform': 'facebook', 'status': status, 'detail': result.stdout[-1000:]})
            break
        payload = result.stdout.split('### Result\n', 1)[1].split('\n### ', 1)[0]
        data = json.loads(payload)
        if data['url'].rstrip('/') != account_url.rstrip('/'):
            status = 'PARTIAL_NAVIGATION_CHANGED'
            break
        evidence = store.evidence(payload, {'platform': 'facebook', 'account_key': account['account_key'],
                                           'source_url': account_url, 'capture_method': 'VISIBLE_OWN_POSTS_NO_COMMENTS'})
        added = 0
        for post in data['posts']:
            match = next((re.search(r'/(?:reel|posts|videos)/([^/]+)', a['url']) for a in post['links']
                          if re.search(r'/(?:reel|posts|videos)/([^/]+)', a['url'])), None)
            if not match or match[1] in seen:
                continue
            seen.add(match[1])
            added += 1
            store.append('facebook-visible-posts', {**post, 'post_id': match[1], 'person_id': person_id,
                'account_key': account['account_key'], 'captured_at': data['captured_at'],
                'published_at': None, 'date_precision': 'DISPLAY_TEXT_ONLY',
                'review_status': 'PENDING', 'evidence_sha256': evidence['sha256']})
        print(json.dumps({'unique_posts': len(seen), 'new_posts': added}), flush=True)
        if data['dialogs']:
            status = 'PARTIAL_DIALOG_REQUIRES_REVIEW'
            break
        stagnant = stagnant + 1 if added == 0 else 0
        if stagnant >= 3:
            status = 'PARTIAL_SCROLL_STALLED'
            break
    store.append('enumeration-attempts', {'platform': 'facebook', 'account_key': account['account_key'],
        'person_id': person_id, 'status': status, 'unique_visible_posts': len(seen),
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
