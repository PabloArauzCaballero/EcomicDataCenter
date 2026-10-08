"""Enumerate public YouTube surfaces without top-N truncation; capture each public post."""

import argparse
import json
import re
import time
from datetime import datetime, timezone
import requests
from history_store import Store, load, now, digest


def initial_json(html, name):
    match = re.search(r'(?:var\s+)?' + re.escape(name) + r'\s*=\s*', html)
    if not match:
        return None
    try:
        return json.JSONDecoder().raw_decode(html[match.end():])[0]
    except json.JSONDecodeError:
        return None


def boundary_status(value, start, end):
    if not value:
        return 'UNKNOWN'
    if len(value) == 10:
        date = value[:10]
        if date in (start[:10], end[:10]):
            return 'BOUNDARY_DATE_NEEDS_TIME'
        return 'IN_WINDOW' if start[:10] < date < end[:10] else 'OUTSIDE_WINDOW'
    try:
        parsed = datetime.fromisoformat(value.replace('Z', '+00:00'))
        if parsed.tzinfo is None:
            return 'UNKNOWN_TIMEZONE'
        return 'IN_WINDOW' if datetime.fromisoformat(start) <= parsed < datetime.fromisoformat(end) else 'OUTSIDE_WINDOW'
    except ValueError:
        return 'INVALID_DATE'


class LedgerLogger:
    def __init__(self, store, task):
        self.store, self.task, self.errors = store, task, []

    def debug(self, message):
        if 'Downloading' in message or 'page ' in message:
            self.store.append('enumeration-log', {'task_id': self.task, 'message': message})

    def warning(self, message):
        self.store.append('enumeration-log', {'task_id': self.task, 'level': 'WARNING', 'message': message})
        if any(word in message.lower() for word in ('incomplete', 'unable to', 'http error', 'retrying')):
            self.errors.append(message)

    def error(self, message):
        self.errors.append(message)
        self.store.append('enumeration-log', {'task_id': self.task, 'level': 'ERROR', 'message': message})


def enumerate_surfaces(store, only=None, include_unverified=False):
    import yt_dlp
    from yt_dlp.version import __version__
    accounts = [r for r in store.leads() if r['platform'] == 'youtube'
                and (include_unverified or r['source_kind'] == 'INHERITED_REVIEW')
                and (not only or r['person_id'] in only)]
    completed = {r['task_id'] for r in store.events('enumeration') if r['status'] == 'EXHAUSTED_FOR_SOURCE'}
    known = {(r['account_key'], r['surface'], r['post_id']) for r in store.events('post-inventory')}
    for account in accounts:
        for surface in ('videos', 'shorts', 'streams'):
            task = account['account_key'] + ':' + surface
            if task in completed:
                continue
            logger = LedgerLogger(store, task)
            count = added = 0
            options = {'extract_flat': 'in_playlist', 'lazy_playlist': True, 'quiet': True,
                       'skip_download': True, 'socket_timeout': 25, 'retries': 0,
                       'extractor_retries': 0, 'sleep_interval_requests': 2,
                       'logger': logger, 'extractor_args': {'youtube': {'lang': ['es']}}}
            url = account['url'].rstrip('/') + '/' + surface
            status, note = 'PARTIAL', None
            try:
                with yt_dlp.YoutubeDL(options) as ydl:
                    info = ydl.extract_info(url, download=False)
                    if not info:
                        raise ValueError('Empty extractor response')
                    store.append('account-observations', {'person_id': account['person_id'],
                        'account_key': account['account_key'], 'url': url, 'platform': 'youtube',
                        'channel_id': info.get('channel_id'), 'channel': info.get('channel'),
                        'title': info.get('title'), 'description': info.get('description'),
                        'follower_count': info.get('channel_follower_count'),
                        'identity_status': account['identity_status'], 'status': 'PUBLIC_CHANNEL_READ',
                        'extractor_version': __version__})
                    for entry in info.get('entries') or []:
                        if not entry or not re.fullmatch(r'[A-Za-z0-9_-]{11}', str(entry.get('id', ''))):
                            logger.errors.append('Missing or invalid video id in enumeration')
                            continue
                        count += 1
                        key = (account['account_key'], surface, entry['id'])
                        if key in known:
                            continue
                        row = {'person_id': account['person_id'], 'account_key': account['account_key'],
                               'identity_status': account['identity_status'], 'platform': 'youtube',
                               'surface': surface, 'post_id': entry['id'],
                               'url': 'https://www.youtube.com/watch?v=' + entry['id'],
                               'title': entry.get('title'), 'title_locale_requested': 'es',
                               'duration_seconds': entry.get('duration'),
                               'views_displayed': entry.get('view_count'), 'metric_precision': 'LISTING_POTENTIALLY_ROUNDED',
                               'listing_timestamp': entry.get('timestamp'), 'published_at': None,
                               'review_status': 'DISCOVERED_ONLY', 'extractor_version': __version__}
                        evidence = store.evidence(json.dumps(row, ensure_ascii=False), {'url': url, 'kind': 'EXTRACTED_LIST_ENTRY'})
                        row['evidence_sha256'] = evidence['sha256']
                        store.append('post-inventory', row)
                        known.add(key)
                        added += 1
                    status = 'PARTIAL' if logger.errors else 'EXHAUSTED_FOR_SOURCE'
            except Exception as error:
                note = str(error)[:800]
                status = 'ACCESS_BLOCKED' if any(t in note.lower() for t in ('429', '403', 'sign in', 'captcha', 'not a bot')) else 'ERROR'
            store.append('enumeration', {'task_id': task, 'person_id': account['person_id'],
                         'account_key': account['account_key'], 'url': url, 'surface': surface,
                         'status': status, 'entries_seen': count, 'new_ids': added,
                         'note': note, 'warnings': logger.errors, 'extractor_version': __version__,
                         'entire_channel_history_proven': False})
            print(account['person_id'], surface, status, 'seen', count, 'new', added, flush=True)
            if status == 'ACCESS_BLOCKED':
                print('Stopped YouTube route at access restriction.', flush=True)
                return
            time.sleep(3)


def capture_posts(store, only=None, max_posts=None):
    incidents = store.events('access-incidents')
    if any(r.get('platform') == 'youtube' and r.get('route') == 'watch'
           and r.get('status') == 'CAPTCHA_AND_HTTP_429' for r in incidents):
        print('Watch route has an unresolved captcha; no requests issued.', flush=True)
        return
    scope = load(store.path / 'scope.json')
    latest = {r['post_id']: r for r in store.events('post-captures')}
    inventory = {r['post_id']: r for r in store.events('post-inventory')
                 if not only or r['person_id'] in only}
    session = requests.Session()
    session.headers.update({'User-Agent': 'Mozilla/5.0', 'Accept-Language': 'es-BO,es;q=0.9'})
    done = 0
    for post_id, item in inventory.items():
        if post_id in latest and latest[post_id]['status'] in ('CAPTURED_METADATA', 'UNAVAILABLE_CONFIRMED'):
            continue
        if max_posts is not None and done >= max_posts:
            return
        row = {k: item[k] for k in ('post_id', 'person_id', 'account_key', 'identity_status', 'url')}
        row.update(platform='youtube', retrieved_at=now(), review_status='PENDING')
        try:
            response = session.get(item['url'] + '&hl=es', timeout=30)
            if response.status_code in (403, 429):
                evidence = store.evidence(response.content, {'url': item['url'], 'http_status': response.status_code, 'kind': 'ACCESS_FAILURE'})
                row.update(status='ACCESS_BLOCKED', http_status=response.status_code,
                           retry_after=response.headers.get('Retry-After'), evidence_sha256=evidence['sha256'])
                store.append('post-captures', row)
                print('YouTube detail access blocked; route stopped.', flush=True)
                return
            response.raise_for_status()
            player = initial_json(response.text, 'ytInitialPlayerResponse') or {}
            video = player.get('videoDetails', {})
            micro = player.get('microformat', {}).get('playerMicroformatRenderer', {})
            playback = player.get('playabilityStatus', {})
            if not video or video.get('videoId') != post_id:
                row.update(status='DETAIL_UNAVAILABLE', playability=playback.get('status'),
                           reason=playback.get('reason'), body_sha256=digest(response.content))
                store.append('post-captures', row)
                if playback.get('status') in ('LOGIN_REQUIRED', 'AGE_CHECK_REQUIRED'):
                    return
                continue
            published = micro.get('publishDate') or micro.get('uploadDate')
            evidence_data = {'videoDetails': {k: video.get(k) for k in ['videoId', 'title', 'shortDescription',
                             'channelId', 'author', 'lengthSeconds', 'viewCount', 'isLiveContent']},
                             'microformat': {k: micro.get(k) for k in ['publishDate', 'uploadDate', 'category', 'isFamilySafe']},
                             'playability': playback.get('status')}
            evidence = store.evidence(json.dumps(evidence_data, ensure_ascii=False),
                                       {'url': item['url'], 'kind': 'PUBLIC_VIDEO_METADATA', 'http_status': response.status_code})
            row.update(status='CAPTURED_METADATA', title=video.get('title'), text=video.get('shortDescription'),
                       author=video.get('author'), channel_id=video.get('channelId'),
                       published_at=published, date_precision='TIMESTAMP' if published and len(published)>10 else 'DAY',
                       window_membership=boundary_status(published, scope['start_inclusive'], scope['end_exclusive']),
                       duration_seconds=int(video['lengthSeconds']) if video.get('lengthSeconds', '').isdigit() else None,
                       views=int(video['viewCount']) if str(video.get('viewCount', '')).isdigit() else None,
                       likes=None, comments=None, evidence_sha256=evidence['sha256'],
                       audio_review='PENDING', visual_review='PENDING', comments_review='PENDING')
            expected = item['url']
            store.append('post-captures', row)
            captions = player.get('captions', {}).get('playerCaptionsTracklistRenderer', {}).get('captionTracks', [])
            store.append('caption-availability', {'post_id': post_id, 'url': expected,
                          'status': 'TRACKS_LISTED' if captions else 'NO_TRACKS_IN_RESPONSE',
                          'tracks': [{k: c.get(k) for k in ('languageCode', 'kind')} for c in captions]})
        except requests.RequestException as error:
            row.update(status='NETWORK_ERROR', error_type=type(error).__name__)
            store.append('post-captures', row)
        done += 1
        if done % 20 == 0:
            print('new details', done, 'of pending inventory', len(inventory), flush=True)
        time.sleep(4)


if __name__ == '__main__':
    parser = argparse.ArgumentParser()
    parser.add_argument('--run', required=True)
    parser.add_argument('--action', choices=['inventory', 'capture'], required=True)
    parser.add_argument('--only')
    parser.add_argument('--include-unverified', action='store_true')
    parser.add_argument('--max-posts', type=int)
    args = parser.parse_args()
    store = Store(args.run)
    only = set(args.only.split(',')) if args.only else None
    if args.action == 'inventory':
        enumerate_surfaces(store, only, args.include_unverified)
    else:
        capture_posts(store, only, args.max_posts)
