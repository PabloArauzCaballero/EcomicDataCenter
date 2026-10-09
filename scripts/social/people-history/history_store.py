"""Append-only evidence and events for the public-figure history collection."""

import gzip
import hashlib
import json
import os
import re
import threading
from datetime import datetime, timezone
from pathlib import Path

ROOT = Path(__file__).resolve().parents[3]
WORKSPACE = ROOT.parent
SOURCE = WORKSPACE / '_publish_people_core/scripts/social/people'
PLAN = ROOT / 'docs/research/personalidades-300-cinco-anos'
PLATFORMS = ('facebook', 'instagram', 'tiktok', 'youtube', 'x', 'linkedin')


def now():
    return datetime.now(timezone.utc).isoformat()


def digest(value):
    return hashlib.sha256(value).hexdigest()


def load(path):
    return json.loads(Path(path).read_text(encoding='utf-8'))


def canonical_account(url):
    from urllib.parse import urlsplit, unquote, parse_qs
    try:
        parsed = urlsplit(url)
        host = (parsed.hostname or '').lower().removeprefix('www.').removeprefix('m.')
        parts = [unquote(p) for p in parsed.path.split('/') if p]
        if not parts:
            return None
        key = parts[0]
        if host in ('twitter.com', 'x.com') and len(parts) == 1 and key not in ('search', 'home', 'intent', 'i', 'explore'):
            return 'x', 'https://x.com/' + key
        if host == 'instagram.com' and len(parts) == 1 and key not in ('p', 'reel', 'reels', 'explore', 'accounts', 'stories'):
            return 'instagram', 'https://www.instagram.com/' + key + '/'
        if host == 'tiktok.com' and key.startswith('@') and len(parts) == 1:
            return 'tiktok', 'https://www.tiktok.com/' + key
        if (host == 'linkedin.com' or re.fullmatch(r'[a-z]{2}\.linkedin\.com', host)) and key == 'in' and (len(parts) == 2 or (len(parts) == 3 and re.fullmatch(r'[a-z]{2}', parts[2]))):
            return 'linkedin', 'https://www.linkedin.com/in/' + parts[1]
        if host == 'youtube.com':
            if key in ('channel', 'c', 'user') and len(parts) == 2:
                return 'youtube', 'https://www.youtube.com/' + '/'.join(parts)
            if key.startswith('@') and len(parts) == 1:
                return 'youtube', 'https://www.youtube.com/' + key
        if host == 'facebook.com':
            if key == 'profile.php' and parse_qs(parsed.query).get('id'):
                return 'facebook', 'https://www.facebook.com/profile.php?id=' + parse_qs(parsed.query)['id'][0]
            if len(parts) == 1 and key not in ('watch', 'reel', 'reels', 'login', 'share', 'sharer.php', 'groups', 'events', 'photo.php'):
                return 'facebook', 'https://www.facebook.com/' + key
            if key == 'people' and len(parts) == 3 and parts[2].isdigit():
                return 'facebook', 'https://www.facebook.com/' + '/'.join(parts)
    except ValueError:
        return None
    return None


class Store:
    def __init__(self, run):
        if not re.fullmatch(r'[A-Za-z0-9_-]+', run):
            raise ValueError('Invalid run identifier')
        self.path = ROOT / 'artifacts/people-history' / run
        self.path.mkdir(parents=True, exist_ok=True)
        (self.path / 'evidence').mkdir(exist_ok=True)
        self.lock = threading.Lock()

    def events(self, name):
        path = self.path / (name + '.jsonl')
        if not path.exists():
            return []
        rows = []
        with path.open(encoding='utf-8') as stream:
            for number, line in enumerate(stream, 1):
                if line.strip():
                    try:
                        rows.append(json.loads(line))
                    except json.JSONDecodeError as error:
                        raise RuntimeError(f'Invalid ledger {path.name}:{number}; repair explicitly') from error
        return rows

    def append(self, name, row):
        row = {'recorded_at': now(), **row}
        line = json.dumps(row, ensure_ascii=False, separators=(',', ':')) + '\n'
        with self.lock:
            with (self.path / (name + '.jsonl')).open('a', encoding='utf-8', newline='\n') as stream:
                stream.write(line)
                stream.flush()
                os.fsync(stream.fileno())
        return row

    def evidence(self, content, metadata):
        content = content.encode('utf-8') if isinstance(content, str) else content
        sha = digest(content)
        target = self.path / 'evidence' / (sha + '.gz')
        if not target.exists():
            with target.open('xb') as stream:
                stream.write(gzip.compress(content, mtime=0))
        return self.append('evidence-index', {
            'sha256': sha, 'bytes': len(content), 'file': 'evidence/' + target.name, **metadata,
        })

    def snapshot(self, name, data):
        target = self.path / name
        temporary = self.path / (name + '.tmp')
        temporary.write_text(json.dumps(data, ensure_ascii=False, indent=2) + '\n', encoding='utf-8')
        temporary.replace(target)

    def leads(self):
        result = {}
        for row in self.events('account-leads'):
            key = (row['person_id'], row['platform'], row['url'])
            previous = result.get(key)
            if previous and previous['source_kind'] == 'INHERITED_REVIEW' and row['source_kind'] != 'INHERITED_REVIEW':
                continue
            result[key] = row
        return list(result.values())

    def add_lead(self, person_id, url, source_url, kind, **metadata):
        parsed = canonical_account(url)
        if not parsed:
            return False
        platform, canonical = parsed
        self.append('account-leads', {
            'person_id': person_id, 'platform': platform, 'url': canonical,
            'account_key': digest((platform + ':' + canonical).encode())[:24],
            'source_url': source_url, 'source_kind': kind,
            'identity_status': 'LEAD_UNVERIFIED', **metadata,
        })
        return True
