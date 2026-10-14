"""Recoge los comentarios de YouTube en videos recientes sobre cada persona del Top 300.

Mide lo que la gente dice DE la persona (videos de prensa, análisis, entrevistas que la nombran en el
título): así no depende de verificar cuentas. Con --own lee además lo que comenta la audiencia en los últimos
videos de SU PROPIO canal de YouTube, que es lo único que existe sin sesión para un creador (su contenido vive en
TikTok e Instagram, y nadie lo nombra en un título); va aparte porque mide a su público, no a quien habla de él. Solo personas adultas
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
OWN = ROOT / 'artifacts' / 'people-conversation-raw-own.jsonl'
# MEDIA se agrega: casi ningún creador tiene ficha en Wikidata, así que con nacimiento «desconocido» quedaban fuera
# todos. Siguen excluidos los menores conocidos (MINOR_OR_UNDER_18) y la salida solo lleva porcentajes y palabras.
ADULT_SECTORS = {'POLITICS', 'BUSINESS', 'MEDIA'}


def eligible(person):
    return person['adultReview'] == 'ADULT_BY_WIKIDATA_BIRTH' or (person['adultReview'] == 'UNKNOWN' and person['sector'] in ADULT_SECTORS)


def read_one(person, deep=False):
    out = []
    for video in yt.search_videos(person['name'], limit=12 if deep else 4):
        texts = yt.comments(video['id'], cap=300 if deep else 120)
        out.append({'slug': person['slug'], 'videoId': video['id'], 'title': video['title'], 'published': video['published'], 'comments': texts})
        time.sleep(0.5)
    return person['slug'], out


def own_channel(person):
    for a in person.get('verifiedAccounts', []):
        if a['platform'] == 'youtube' and a.get('url'):
            return a['url']
    return None


def read_own(person, url):
    out = []
    for video in yt.channel_videos(url, limit=8):
        out.append({'videoId': video['id'], 'title': video['title'], 'published': video['published'],
                    'comments': yt.comments(video['id'], cap=150)})
        time.sleep(0.5)
    return person['slug'], {'channel': url, 'videos': out}


def main_own(limit):
    """Canal propio: quien tiene una cuenta de YouTube verificada en el ranking, de cualquier sector."""
    ranking = json.loads((HERE / 'ranking-top300.json').read_text(encoding='utf8'))['people']
    OWN.parent.mkdir(parents=True, exist_ok=True)
    done = {json.loads(line)['slug'] for line in OWN.read_text(encoding='utf8').splitlines() if line} if OWN.exists() else set()
    todo = [(p, own_channel(p)) for p in ranking[:limit] if eligible(p) and p['slug'] not in done]
    todo = [(p, u) for p, u in todo if u]
    print(len(todo), 'canales propios por leer', flush=True)
    with ThreadPoolExecutor(max_workers=2) as ex, OWN.open('a', encoding='utf8') as fh:
        for n, (slug, row) in enumerate(ex.map(lambda t: read_own(*t), todo), 1):
            # Un canal que devolvió 0 comentarios en todos sus videos casi siempre es un límite (HTTP 429), no un
            # canal sin comentarios: no se guarda como «leído» para que se repita en la próxima corrida.
            if row['videos'] and not any(v['comments'] for v in row['videos']):
                print('  sin comentarios (¿429?):', slug, flush=True)
                continue
            fh.write(json.dumps({'slug': slug, **row}, ensure_ascii=False) + '\n')
            fh.flush()


def main():
    ranking = json.loads((HERE / 'ranking-top300.json').read_text(encoding='utf8'))['people']
    if '--own' in sys.argv:
        args = [a for a in sys.argv[1:] if not a.startswith('--')]
        return main_own(int(args[0]) if args else 10000)
    deep = '--deep' in sys.argv
    args = [a for a in sys.argv[1:] if not a.startswith('--')]
    limit = int(args[0]) if args else 10000
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
