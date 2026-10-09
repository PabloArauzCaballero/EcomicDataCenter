"""Read Instagram's public embeds for URLs already found on a corroborated profile."""
import argparse
import re
import time
from urllib.parse import urlsplit

import requests
from bs4 import BeautifulSoup

from history_store import Store, now, canonical_account


def extract_caption(soup, handle):
    caption = soup.select_one('.Caption')
    author = caption.select_one('.CaptionUsername') if caption else None
    if author is None or author.get_text(' ', strip=True).casefold() != handle.casefold():
        return None
    expected = 'https://www.instagram.com/' + handle + '/'
    if canonical_account(author.get('href', '')) != ('instagram', expected):
        return None
    for element in caption.select('.CaptionComments'):
        element.decompose()
    author.decompose()
    return caption.get_text(' ', strip=True)


def collect(run):
    store = Store(run)
    confirmed = {(r['person_id'], r['account_key']) for r in store.events('account-reviews')
                 if r['status'] == 'CORROBORATED' and r['platform'] == 'instagram'}
    accounts = {(a['person_id'], a['account_key']): a for a in store.leads()
                if (a['person_id'], a['account_key']) in confirmed}
    done = {r['post_id'] for r in store.events('instagram-embed-attempts')}
    session = requests.Session()
    session.headers.update({'User-Agent': 'Mozilla/5.0', 'Accept-Language': 'es-BO,es;q=0.9'})
    for surface in store.events('public-surface-inventory'):
        if surface.get('platform') != 'instagram':
            continue
        account = next((a for a in accounts.values() if a['person_id'] == surface['person_id']
                        and a['url'].rstrip('/') == surface['account_url'].rstrip('/')), None)
        if account is None:
            continue
        handle = urlsplit(account['url']).path.strip('/')
        for original in surface['urls']:
            match = re.search(r'/(?:p|reel)/([A-Za-z0-9_-]+)/?$', original)
            if not match or match[1] in done:
                continue
            post_id = match[1]
            route = 'reel' if '/reel/' in original else 'p'
            embed_url = f'https://www.instagram.com/{route}/{post_id}/embed/captioned/'
            row = {'person_id': account['person_id'], 'account_key': account['account_key'],
                   'post_id': post_id, 'source_url': original, 'embed_url': embed_url,
                   'historical_enumeration_complete': False}
            try:
                response = session.get(embed_url, timeout=25)
                evidence = store.evidence(response.content, {'platform': 'instagram',
                    'source_url': embed_url, 'kind': 'PUBLIC_EMBED', 'http_status': response.status_code})
                row.update(http_status=response.status_code, evidence_sha256=evidence['sha256'],
                           retrieved_at=now())
                if response.status_code in (403, 429):
                    row['status'] = 'ACCESS_BLOCKED'
                    store.append('instagram-embed-attempts', row)
                    return
                if response.status_code != 200:
                    row['status'] = 'HTTP_ERROR'
                else:
                    soup = BeautifulSoup(response.text, 'html.parser')
                    caption = extract_caption(soup, handle)
                    if caption is None:
                        row['status'] = 'UNUSABLE_OR_WRONG_AUTHOR'
                    else:
                        row['status'] = 'CAPTION_VISIBLE'
                        store.append('instagram-embed-posts', {
                            'person_id': account['person_id'], 'account_key': account['account_key'],
                            'post_id': post_id, 'url': original, 'embed_url': embed_url,
                            'caption': caption, 'caption_review_status': 'PENDING',
                            'published_at': None, 'date_precision': 'UNKNOWN',
                            'audiovisual_review_complete': False, 'retrieved_at': now(),
                            'evidence_sha256': evidence['sha256']})
                store.append('instagram-embed-attempts', row)
                done.add(post_id)
                print(post_id, row['status'], flush=True)
            except requests.RequestException as error:
                row.update(status='NETWORK_ERROR', error_type=type(error).__name__)
                store.append('instagram-embed-attempts', row)
            time.sleep(2)


if __name__ == '__main__':
    parser = argparse.ArgumentParser()
    parser.add_argument('--run', required=True)
    collect(parser.parse_args().run)
