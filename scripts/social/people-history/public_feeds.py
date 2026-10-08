"""Public RSS metadata as an independent, explicitly limited source; never fetches watch pages."""

import argparse
import time
import xml.etree.ElementTree as ET
import requests
from history_store import Store, now, load
from youtube_history import boundary_status

NS = {'a': 'http://www.w3.org/2005/Atom', 'yt': 'http://www.youtube.com/xml/schemas/2015',
      'm': 'http://search.yahoo.com/mrss/'}


def collect(run):
    store = Store(run)
    scope = load(store.path / 'scope.json')
    done = {r['account_key'] for r in store.events('rss-reads')}
    session = requests.Session()
    session.headers.update({'User-Agent': 'ObservatorioEconomico/1.0 (public RSS reader)'})
    for account in store.leads():
        if account['platform'] != 'youtube' or '/channel/' not in account['url'] or account['account_key'] in done:
            continue
        channel_id = account['url'].rsplit('/', 1)[-1]
        url = 'https://www.youtube.com/feeds/videos.xml?channel_id=' + channel_id
        row = {'person_id': account['person_id'], 'account_key': account['account_key'],
               'channel_id': channel_id, 'url': url, 'exhaustive_history': False,
               'identity_status': account['identity_status']}
        try:
            response = session.get(url, timeout=25)
            evidence = store.evidence(response.content, {'url': url, 'kind': 'PUBLIC_RSS_FEED', 'http_status': response.status_code})
            row.update(http_status=response.status_code, evidence_sha256=evidence['sha256'])
            if response.status_code in (403, 429):
                row['status'] = 'ACCESS_BLOCKED'
                store.append('rss-reads', row)
                return
            response.raise_for_status()
            root = ET.fromstring(response.content)
            channel_reported = root.findtext('yt:channelId', namespaces=NS)
            # YouTube's feed uses the channel's bare ID in some versions and UC-prefixed ID in others.
            if channel_reported not in (channel_id, channel_id.removeprefix('UC')):
                row.update(status='CHANNEL_ID_MISMATCH', reported_channel=channel_reported)
                store.append('rss-reads', row)
                continue
            entries = root.findall('a:entry', NS)
            row.update(status='RECENT_FEED_ONLY', entries=len(entries),
                       channel_title=root.findtext('a:title', namespaces=NS))
            for item in entries:
                published = item.findtext('a:published', namespaces=NS)
                post_id = item.findtext('yt:videoId', namespaces=NS)
                views = item.find('m:group/m:community/m:statistics', NS)
                likes = item.find('m:group/m:community/m:starRating', NS)
                store.append('rss-posts', {
                    'person_id': account['person_id'], 'account_key': account['account_key'],
                    'identity_status': account['identity_status'], 'channel_id': channel_id,
                    'post_id': post_id, 'url': 'https://www.youtube.com/watch?v=' + post_id,
                    'title': item.findtext('a:title', namespaces=NS),
                    'description': item.findtext('m:group/m:description', namespaces=NS),
                    'published_at': published, 'date_precision': 'TIMESTAMP',
                    'window_membership': boundary_status(published, scope['start_inclusive'], scope['end_exclusive']),
                    'updated_at': item.findtext('a:updated', namespaces=NS),
                    'views': int(views.get('views')) if views is not None and views.get('views', '').isdigit() else None,
                    'likes': None, 'rating_count': likes.get('count') if likes is not None else None,
                    'retrieved_at': now(), 'source_url': url, 'evidence_sha256': evidence['sha256'],
                    'review_status': 'METADATA_ONLY_AUDIOVISUAL_PENDING',
                })
            store.append('rss-reads', row)
            print(account['person_id'], 'public feed entries', len(entries), flush=True)
        except (requests.RequestException, ET.ParseError) as error:
            row.update(status='SOURCE_ERROR', error_type=type(error).__name__)
            store.append('rss-reads', row)
        time.sleep(2)


if __name__ == '__main__':
    parser = argparse.ArgumentParser()
    parser.add_argument('--run', required=True)
    collect(parser.parse_args().run)
