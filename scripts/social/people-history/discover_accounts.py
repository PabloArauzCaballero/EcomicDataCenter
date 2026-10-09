"""Resumable public web discovery. Search matches remain unverified leads."""

import argparse
import base64
import re
import time
import unicodedata
from urllib.parse import urlencode, urlsplit, parse_qs
import requests
from bs4 import BeautifulSoup
from history_store import Store, PLATFORMS, load, now

DOMAINS = {'facebook': 'facebook.com', 'instagram': 'instagram.com', 'tiktok': 'tiktok.com',
           'youtube': 'youtube.com', 'x': 'x.com', 'linkedin': 'linkedin.com/in'}


def relevant(name, result):
    def words(text):
        folded = ''.join(c for c in unicodedata.normalize('NFKD', text.lower()) if not unicodedata.combining(c))
        return set(re.findall(r'[a-z]{3,}', folded)) - {'del', 'las', 'los'}
    required = words(name)
    observed = words(result['title'] + ' ' + result['snippet'] + ' ' + result['url'])
    return len(required & observed) >= min(2, len(required))


def decode_link(url):
    if url.startswith('https://www.bing.com/ck/'):
        encoded = parse_qs(urlsplit(url).query).get('u', [''])[0]
        if encoded.startswith('a1'):
            try:
                return base64.urlsafe_b64decode(encoded[2:] + '=' * (-len(encoded[2:]) % 4)).decode()
            except (ValueError, UnicodeDecodeError):
                return url
    return url


def parse_results(html):
    soup = BeautifulSoup(html, 'html.parser')
    rows = []
    for item in soup.select('li.b_algo'):
        anchor = item.select_one('h2 a')
        if anchor and anchor.get('href'):
            summary = item.select_one('.b_caption p')
            rows.append({'url': decode_link(anchor['href']), 'title': anchor.get_text(' ', strip=True),
                         'snippet': summary.get_text(' ', strip=True) if summary else ''})
    return rows, soup.title.get_text(' ', strip=True) if soup.title else ''


def discover(run, only=None, max_tasks=None, targeted=False):
    store = Store(run)
    people = load(store.path / 'people.json')['people']
    completed = {r['task_id'] for r in store.events('discovery') if r['status'] in ('SEARCHED_WITH_RESULTS', 'SEARCHED_NO_RESULTS')}
    session = requests.Session()
    session.headers.update({'User-Agent': 'Mozilla/5.0', 'Accept-Language': 'es-BO,es;q=0.9'})
    done = 0
    unreliable_streak = 0
    for person in people:
        if only and person['slug'] not in only:
            continue
        for platform in PLATFORMS if targeted else ('all',):
            task_id = person['slug'] + ':' + platform
            if task_id in completed:
                continue
            if max_tasks is not None and done >= max_tasks:
                return
            query = f'"{person["name"]}" Bolivia redes sociales'
            if platform != 'all':
                query = f'"{person["name"]}" site:{DOMAINS[platform]}'
            url = 'https://www.bing.com/search?' + urlencode({'q': query, 'count': 20, 'setlang': 'es'})
            row = {'task_id': task_id, 'person_id': person['slug'], 'platform': platform,
                   'query': query, 'url': url, 'searched_at': now(), 'exhaustive': False}
            try:
                response = session.get(url, timeout=30)
                evidence = store.evidence(response.content, {'url': url, 'http_status': response.status_code,
                                                             'kind': 'SEARCH_RESPONSE'})
                row['evidence_sha256'] = evidence['sha256']
                row['http_status'] = response.status_code
                results, title = parse_results(response.text)
                challenge = bool(re.search(r'<title>[^<]*(?:captcha|verify|robot|challenge)', response.text, re.I))
                if response.status_code in (403, 429) or challenge or 'challenge' in response.url:
                    row.update(status='ACCESS_BLOCKED', retry_after=response.headers.get('Retry-After'))
                    store.append('discovery', row)
                    print('Search access blocked; stopped without retrying.', flush=True)
                    return
                response.raise_for_status()
                qualified = [result for result in results if relevant(person['name'], result)]
                unreliable_streak = unreliable_streak + 1 if results and not qualified else 0
                row.update(status='SEARCHED_WITH_RESULTS' if qualified else ('SEARCH_UNRELIABLE' if results else 'SEARCHED_NO_RESULTS'),
                           results=results, result_count=len(results), page_title=title)
                row['relevant_result_count'] = len(qualified)
                for result in qualified:
                    store.add_lead(person['slug'], result['url'], url, 'BING_DISCOVERY',
                                   search_title=result['title'], search_snippet=result['snippet'],
                                   evidence_sha256=evidence['sha256'])
                store.append('discovery', row)
                if unreliable_streak >= 3:
                    print('Three irrelevant result sets: stopping this search source.', flush=True)
                    return
            except requests.RequestException as error:
                row.update(status='NETWORK_ERROR', error_type=type(error).__name__)
                store.append('discovery', row)
            done += 1
            if done % 10 == 0:
                print(f'searched={done} remaining_at_start={len(people) * (6 if targeted else 1) - len(completed)} person={person["slug"]}', flush=True)
            time.sleep(2)
    print(f'Completed discovery pass: {done} new queries; no account auto-verified.', flush=True)


if __name__ == '__main__':
    parser = argparse.ArgumentParser()
    parser.add_argument('--run', required=True)
    parser.add_argument('--only')
    parser.add_argument('--max-tasks', type=int)
    parser.add_argument('--targeted', action='store_true')
    args = parser.parse_args()
    discover(args.run, set(args.only.split(',')) if args.only else None, args.max_tasks, args.targeted)
