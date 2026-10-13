"""Read public profile metadata and record access restrictions without bypassing them."""

import argparse
import re
import time
from urllib.parse import urljoin
import requests
from bs4 import BeautifulSoup
from history_store import Store, load, now, canonical_account
from discover_accounts import relevant


def ingest_search(store):
    imported = {r['file'] for r in store.events('search-imports')}
    for path in sorted(store.path.glob('web-discovery-*.json')):
        if path.name in imported:
            continue
        for row in load(path)['rows']:
            for result in row.get('results', []):
                if relevant(row['name'], {**result, 'snippet': ''}):
                    url = result['url']
                    if '/with_replies' in url:
                        url = url.split('/with_replies')[0]
                    store.add_lead(row['person_id'], url, result['url'], 'WEB_TOOL_SEARCH',
                                   search_title=result['title'], evidence_file=path.name)
            store.append('discovery', {**row, 'platform': 'all', 'task_id': row['person_id'] + ':web',
                                      'status': 'WEB_RESULTS_REQUIRE_REVIEW', 'evidence_file': path.name})
        store.append('search-imports', {'file': path.name})


def probe(run, platforms=None, only=None):
    store = Store(run)
    ingest_search(store)
    done = {r['account_key'] for r in store.events('account-probes')}
    blocked = {platform for previous in store.events('access-passes')
               for platform in previous.get('routes_stopped_for_access_restriction', [])}
    session = requests.Session()
    session.headers.update({'User-Agent': 'Mozilla/5.0', 'Accept-Language': 'es-BO,es;q=0.9'})
    rejected = {r['account_key'] for r in store.events('lead-reviews') if r['status'] == 'REJECTED'}
    for account in store.leads():
        platform = account['platform']
        if account['account_key'] in done or account['account_key'] in rejected:
            continue
        if (platforms and platform not in platforms) or (only and account['person_id'] not in only):
            continue
        if platform in blocked:
            continue
        row = {k: account[k] for k in ('person_id', 'account_key', 'platform', 'url', 'identity_status')}
        row['retrieved_at'] = now()
        try:
            response = session.get(account['url'], timeout=25)
            row['http_status'] = response.status_code
            soup = BeautifulSoup(response.text, 'html.parser')
            title = soup.title.get_text(' ', strip=True) if soup.title else ''
            row['page_title'] = title
            if response.status_code in (403, 429, 999) or re.search(r'captcha|verify.*human|just a moment', title, re.I):
                row.update(status='ACCESS_BLOCKED', retry_after=response.headers.get('Retry-After'))
                blocked.add(platform)
            elif response.status_code == 404:
                row['status'] = 'NOT_FOUND_HTTP_404'
            elif response.status_code >= 400:
                row['status'] = 'HTTP_ERROR'
            else:
                meta = {}
                for tag in soup.select('meta[property], meta[name]'):
                    key = tag.get('property') or tag.get('name')
                    if key in ('og:title', 'og:description', 'og:url', 'description', 'twitter:title', 'twitter:description'):
                        meta[key] = tag.get('content')
                row['metadata'] = meta
                linked_accounts = []
                for anchor in soup.select('a[href]'):
                    candidate = canonical_account(urljoin(response.url, anchor['href']))
                    if candidate and candidate[0] != platform:
                        linked_accounts.append({'platform': candidate[0], 'url': candidate[1]})
                row['crosslinks_require_context_review'] = list({x['url']:x for x in linked_accounts}.values())
                if re.search(r'log.?in|sign.?in|iniciar sesi[oó]n|acceder', title, re.I):
                    row['status'] = 'LOGIN_REQUIRED'
                    blocked.add(platform)
                else:
                    row['status'] = 'PUBLIC_METADATA_ONLY' if meta else 'HTML_WITHOUT_USABLE_METADATA'
                row['history_enumerated'] = False
            evidence = store.evidence(__import__('json').dumps(row, ensure_ascii=False),
                                       {'url': account['url'], 'kind': 'PUBLIC_PROFILE_METADATA',
                                        'http_status': response.status_code})
            row['evidence_sha256'] = evidence['sha256']
            store.append('account-probes', row)
            print(platform, account['person_id'], row['status'], flush=True)
        except requests.RequestException as error:
            row.update(status='NETWORK_ERROR', error_type=type(error).__name__)
            store.append('account-probes', row)
        time.sleep(3)
    store.append('access-passes', {'platforms': sorted(platforms) if platforms else 'all',
                                  'routes_stopped_for_access_restriction': sorted(blocked)})


if __name__ == '__main__':
    parser = argparse.ArgumentParser()
    parser.add_argument('--run', required=True)
    parser.add_argument('--platforms')
    parser.add_argument('--only')
    parser.add_argument('--import-only', action='store_true')
    args = parser.parse_args()
    if args.import_only:
        ingest_search(Store(args.run))
    else:
        probe(args.run, set(args.platforms.split(',')) if args.platforms else None,
              set(args.only.split(',')) if args.only else None)
