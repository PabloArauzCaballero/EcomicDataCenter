"""Attach text-review evidence, identify inherited date problems, and retain modality gaps."""

import argparse
import collections
import re
from history_store import Store, load, digest


def reconcile(run):
    store = Store(run)
    input_rows = load(store.path / 'prior-text-review-input.json')['posts']
    posts = {r['post_id']: r for r in input_rows}
    annotations = load(store.path / 'prior-text-annotations.json')['annotations']
    assert len(annotations) == len({a['post_id'] for a in annotations}) == len(posts)
    existing = {r['post_id'] for r in store.events('text-reviews')}
    for annotation in annotations:
        post = posts[annotation['post_id']]
        assert annotation['full_post_review_complete'] is False
        assert annotation['audiovisual_review_complete'] is False
        if annotation['post_id'] in existing:
            continue
        store.append('text-reviews', {**annotation, 'person_id': post['person_id'], 'url': post['url'],
                     'status': 'TEXT_REVIEWED_AUDIOVISUAL_PENDING',
                     'source_capture_key': post['capture_key'], 'source_sha256': post['source_sha256'],
                     'text_sha256': digest(post['text'].encode()), 'character_range': [0, len(post['text'])],
                     'date_precision': post['date_precision']})
    issues = []
    dates = collections.Counter((r['person_id'], r['published_at_legacy']) for r in input_rows)
    for (person_id, date), count in dates.items():
        if count >= 5:
            issues.append({'person_id': person_id, 'severity': 'HIGH', 'kind': 'LEGACY_DATE_HEAPING',
                           'date': date, 'posts': count, 'interpretation': 'Possible relative-date conversion; exact publication day not established.'})
    issues.append({'post_id': 'rXviGA4lhWM', 'severity': 'MEDIUM', 'kind': 'TITLE_DESCRIPTION_DIFFER',
                   'interpretation': 'Title and description name different songs; audiovisual content must resolve.'})
    issues.append({'post_id': 'baH9dsd119Y', 'severity': 'HIGH', 'kind': 'TITLE_DATE_TENSION',
                   'interpretation': 'Year-end 2024 title paired with legacy date 2025-10-04; timing requires primary evidence, not automatic correction.'})
    for issue in issues:
        store.append('quality-issues', issue)
    # These links appear explicitly in the previously corroborated artist channel's description.
    for post in input_rows:
        if post['person_id'] != 'P_ELIAS_AYAVIRI':
            continue
        for url in re.findall(r'https://(?:www\.)?(?:instagram|facebook)\.com/[^\s]+', post['text']):
            store.add_lead(post['person_id'], url, post['url'], 'CROSSLINK_IN_PRIOR_CORROBORATED_CHANNEL',
                           source_capture_key=post['capture_key'], identity_status='PRIOR_CROSSLINK_CURRENT_PROFILE_REVIEW_PENDING')
    store.snapshot('text-review-validation.json', {'status': 'PASS', 'individual_text_reviews': len(annotations),
                    'full_audiovisual_reviews': 0, 'legacy_date_issues': len(issues),
                    'new_historical_dates_verified': 0})
    print('Validated individual text reviews:', len(annotations), '; full audiovisual reviews: 0')


if __name__ == '__main__':
    parser = argparse.ArgumentParser()
    parser.add_argument('--run', required=True)
    reconcile(parser.parse_args().run)
