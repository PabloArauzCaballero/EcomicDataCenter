"""Recoge los comentarios de YouTube en videos recientes sobre cada persona del Top 300.

Mide lo que la gente dice DE la persona (videos de prensa, análisis, entrevistas que la nombran en el
título), no lo que dicen en su propio canal: así no depende de verificar cuentas. Solo personas adultas
(nacimiento en Wikidata o cargo político/empresarial). Los textos quedan en artifacts/ (fuera de Git) y se
borran tras clasificarlos; la salida pública no lleva autores ni textos. Se puede interrumpir y repetir.
"""
import json, sys, time
from concurrent.futures import ThreadPoolExecutor
from pathlib import Path

import yt_comments as yt

HERE = Path(__file__).parent
ROOT = HERE.parents[2]
RAW = ROOT / 'artifacts' / 'people-conversation-raw.jsonl'
DEEP = ROOT / 'artifacts' / 'people-conversation-raw-deep.jsonl'
ADULT_SECTORS = {'POLITICS', 'BUSINESS'}


def eligible(person):
    return person['adultReview'] == 'ADULT_BY_WIKIDATA_BIRTH' or (person['adultReview'] == 'UNKNOWN' and person['sector'] in ADULT_SECTORS)


def read_one(person, deep=False):
    out = []
    for video in yt.search_videos(person['name'], limit=12 if deep else 4):
        texts = yt.comments(video['id'], cap=300 if deep else 120)
        out.append({'slug': person['slug'], 'videoId': video['id'], 'title': video['title'], 'published': video['published'], 'comments': texts})
        time.sleep(0.5)
    return person['slug'], out


def main():
    ranking = json.loads((HERE / 'ranking-top300.json').read_text(encoding='utf8'))['people']
    deep = '--deep' in sys.argv
    args = [a for a in sys.argv[1:] if not a.startswith('--')]
    limit = int(args[0]) if args else 300
    target = DEEP if deep else RAW
    target.parent.mkdir(parents=True, exist_ok=True)
    done = set()
    if target.exists():
        done = {json.loads(line)['slug'] for line in target.read_text(encoding='utf8').splitlines() if line}
    todo = [p for p in ranking[:limit] if eligible(p) and p['slug'] not in done]
    if deep:
        # Segunda pasada: solo quienes quedaron sin muestra suficiente (más videos y más comentarios por video).
        talk = json.loads((HERE / 'conversation-sentiment.json').read_text(encoding='utf8'))['people']
        todo = [p for p in todo if p['slug'] in talk and not talk[p['slug']]['sentiment']]
    print(len(todo), 'personas por leer', flush=True)
    with ThreadPoolExecutor(max_workers=3) as ex, target.open('a', encoding='utf8') as fh:
        for n, (slug, rows) in enumerate(ex.map(lambda p: read_one(p, deep), todo), 1):
            fh.write(json.dumps({'slug': slug, 'videos': rows}, ensure_ascii=False) + '\n')
            fh.flush()
            if n % 10 == 0:
                print(n, 'listas', flush=True)


if __name__ == '__main__':
    main()
