"""Reconcile exact public-feed dates and individually authored text annotations."""
import argparse
from history_store import Store, load, digest


def reconcile(run):
    store = Store(run)
    confirmed = {(r['person_id'], r['account_key']) for r in store.events('account-reviews') if r['status'] == 'CORROBORATED'}
    rss = {r['post_id']: r for r in store.events('rss-posts') if (r['person_id'], r.get('account_key')) in confirmed}
    facebook = {r['post_id']: r for r in store.events('facebook-visible-posts') if (r['person_id'], r['account_key']) in confirmed}
    instagram = {r['post_id']: r for r in store.events('instagram-embed-posts') if (r['person_id'], r['account_key']) in confirmed}
    already = {(r['post_id'], r['evidence_sha256']) for r in store.events('post-date-evidence')}
    for post in rss.values():
        if (post['post_id'], post['evidence_sha256']) not in already:
            store.append('post-date-evidence', {k: post[k] for k in
                ('post_id', 'person_id', 'account_key', 'published_at', 'date_precision',
                 'window_membership', 'source_url', 'evidence_sha256')})
    reviewed = {r['post_id']: r for r in store.events('text-reviews')}
    annotations = load(store.path / 'current-text-annotations.json')['annotations']
    if len(annotations) != len({r['post_id'] for r in annotations}):
        raise ValueError('Duplicate annotations')
    for annotation in annotations:
        source = annotation['source']
        post = {'rss': rss, 'facebook': facebook, 'instagram': instagram}[source][annotation['post_id']]
        text = (post['title'] + '\n' + (post.get('description') or '')) if source == 'rss' else (
            post['text'] if source == 'facebook' else post['caption'])
        if post['post_id'] in reviewed and reviewed[post['post_id']]['text_sha256'] == digest(text.encode()):
            continue
        url = next(a['url'] for a in post['links'] if '/reel/' in a['url']) if source == 'facebook' else post['url']
        store.append('text-reviews', {**annotation, 'person_id': post['person_id'], 'url': url,
            'platform': 'youtube' if source == 'rss' else source,
            'review_method': 'AI_INDIVIDUAL_READING_OF_CAPTURED_TEXT',
            'review_scope': 'TITLE_DESCRIPTION_ONLY' if source == 'rss' else 'VISIBLE_CAPTION_ONLY',
            'status': 'TEXT_REVIEWED_AUDIOVISUAL_PENDING', 'source_capture_key': post['evidence_sha256'],
            'source_sha256': post['evidence_sha256'], 'text_sha256': digest(text.encode()),
            'character_range': [0, len(text)], 'full_post_review_complete': False,
            'audiovisual_review_complete': False, 'date_precision': post['date_precision'],
            'review_revision_of': reviewed.get(post['post_id'], {}).get('recorded_at')})
    print('Exact date evidence:', len(rss), '; additional text annotations:', len(annotations))


if __name__ == '__main__':
    parser = argparse.ArgumentParser()
    parser.add_argument('--run', required=True)
    reconcile(parser.parse_args().run)
