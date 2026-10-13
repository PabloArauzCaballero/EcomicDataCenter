"""Reuse auditable prior captures without claiming new observations or exact legacy dates."""

import argparse
import json
from history_store import Store, SOURCE, load, digest, canonical_account


def import_prior(run):
    store = Store(run)
    reviewed = load(SOURCE / 'reviewed-pilot-accounts.json')
    directory = SOURCE.parents[2] / 'artifacts/people-social-raw'
    # SOURCE is <core>/scripts/social/people, so parents[2] is the source core.
    existing = {row['capture_key'] for row in store.events('prior-posts')}
    added = 0
    for path in sorted(directory.glob('*/*.jsonl')):
        source_hash = digest(path.read_bytes())
        for line in path.read_text(encoding='utf-8').split('\n'):
            if not line.strip():
                continue
            record = json.loads(line)
            profile = record['profile']
            person_id = profile['slug']
            if person_id not in reviewed:
                continue
            if canonical_account(profile['url']) != canonical_account(reviewed[person_id]['url']):
                continue
            for post in record.get('posts', []):
                key = digest((source_hash + ':' + post['postId']).encode())
                if key in existing:
                    continue
                row = {
                    'capture_key': key, 'person_id': person_id, 'platform': post['platform'],
                    'post_id': post['postId'], 'url': post['url'], 'account_url': profile['url'],
                    'text': post.get('text'), 'published_at_legacy': post.get('publishedAt'),
                    'date_precision': 'LEGACY_PRECISION_NOT_PROVEN',
                    'retrieved_at': profile['retrievedAt'], 'views': post.get('views'),
                    'likes': post.get('likes'), 'comments': post.get('comments'),
                    'format': post.get('format'), 'review_status': 'PENDING',
                    'identity_status': 'INHERITED_CORROBORATION',
                    'source_file': str(path), 'source_sha256': source_hash,
                    'source_profile_sha256': profile.get('sha256'),
                    'capture_origin': 'PRIOR_RUN_NOT_NEW_CAPTURE',
                    'audio_review': 'NOT_CAPTURED', 'visual_review': 'NOT_CAPTURED',
                }
                store.append('prior-posts', row)
                existing.add(key)
                added += 1
    unique = {}
    for row in store.events('prior-posts'):
        previous = unique.get(row['post_id'])
        if not previous or len(row.get('text') or '') > len(previous.get('text') or ''):
            unique[row['post_id']] = row
    store.snapshot('prior-text-review-input.json', {'status': 'TEXT_ONLY_REVIEW_PENDING', 'posts': list(unique.values())})
    print('Imported captures:', added, 'unique posts:', len(unique))


if __name__ == '__main__':
    parser = argparse.ArgumentParser()
    parser.add_argument('--run', required=True)
    import_prior(parser.parse_args().run)
