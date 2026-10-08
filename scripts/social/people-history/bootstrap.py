"""Freeze the authorized corpus and reconcile prior research without inventing reviews."""

import argparse
import collections
from history_store import Store, SOURCE, PLAN, load, digest, now


def bootstrap(run):
    store = Store(run)
    if (store.path / 'scope.json').exists():
        print('Existing scope retained:', store.path)
        return
    research = load(SOURCE / 'research-300.json')
    people = research['people']
    selected = {p['slug'] for p in people}
    assert len(selected) == len(people) == 300
    scope = load(PLAN / 'scope.json')
    scope.update({
        'status': 'EXECUTION_IN_PROGRESS', 'started_at': now(),
        'authorization': 'User explicitly requested full execution of the plan on 2026-10-08',
        'comments_scope': 'AGGREGATED_WITHOUT_AUTHOR_IDENTIFIERS',
        'paid_access': 'NO_NEW_PURCHASES',
        'source_sha256': digest((SOURCE / 'research-300.json').read_bytes()),
    })
    store.snapshot('scope.json', scope)
    store.snapshot('people.json', research)
    for person in people:
        for lead in person.get('accountLeads', []):
            store.add_lead(person['slug'], lead['url'], lead.get('sourceUrl'), 'PRIOR_RESEARCH_LEAD')
    for person in load(SOURCE / 'shortlist.json')['people']:
        if person['slug'] in selected:
            for account in person.get('accounts', {}).values():
                store.add_lead(person['slug'], account['url'], account.get('sourceUrl'), 'PRIOR_WIKIDATA_LEAD')
    for person_id, review in load(SOURCE / 'reviewed-pilot-accounts.json').items():
        if person_id in selected:
            store.add_lead(person_id, review['url'], review['sources'][0], 'INHERITED_REVIEW',
                           identity_status='CORROBORATED_PREVIOUS_RUN_RECHECK_PENDING',
                           adult_status=review['adultStatus'], sources=review['sources'], rationale=review['rationale'])
            store.append('identity-reviews', {'person_id': person_id, **review,
                                             'status': 'INHERITED_REVIEW_NOT_A_NEW_VERIFICATION'})
    counts = collections.Counter(x['platform'] for x in store.leads())
    store.snapshot('bootstrap-summary.json', {'people': 300, 'leads': len(store.leads()),
                                             'leads_by_platform': dict(counts), 'new_posts_reviewed': 0})
    print(dict(counts), 'unique leads', len(store.leads()))


if __name__ == '__main__':
    parser = argparse.ArgumentParser()
    parser.add_argument('--run', required=True)
    bootstrap(parser.parse_args().run)
