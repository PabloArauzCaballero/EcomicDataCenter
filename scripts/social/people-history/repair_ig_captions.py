"""Append corrections from preserved embed HTML; never rewrite raw evidence."""
import argparse
import gzip
from urllib.parse import urlsplit

from bs4 import BeautifulSoup
from history_store import Store
from instagram_embed import extract_caption


def repair(run):
    store = Store(run)
    evidence = {r['sha256']: r for r in store.events('evidence-index')}
    accounts = {a['account_key']: a for a in store.leads() if a['platform'] == 'instagram'}
    posts = {r['post_id']: r for r in store.events('instagram-embed-posts')}
    changed = 0
    for post in posts.values():
        handle = urlsplit(accounts[post['account_key']]['url']).path.strip('/')
        raw = gzip.decompress((store.path / evidence[post['evidence_sha256']]['file']).read_bytes())
        caption = extract_caption(BeautifulSoup(raw, 'html.parser'), handle)
        if caption is None or caption == post['caption']:
            continue
        store.append('instagram-embed-posts', {k: v for k, v in post.items() if k != 'recorded_at'} |
                     {'caption': caption, 'revision_of': post['recorded_at'],
                      'revision_reason': 'REMOVE_EMBED_COMMENTS_BUTTON_FROM_CAPTION'})
        changed += 1
    print('Corrected visible captions:', changed)


if __name__ == '__main__':
    parser = argparse.ArgumentParser()
    parser.add_argument('--run', required=True)
    repair(parser.parse_args().run)
