"""Clasifica los comentarios recogidos por collect_conversation.py y publica solo agregados.

Corre con el Python del entorno social (~/.observatorio-social/venv). Un comentario cuenta si está en
español (>= 0,7, cuatro palabras o más). Una persona publica sentimiento con al menos 30 comentarios
clasificados. No sale ningún texto ni autor: solo porcentajes, palabras frecuentes y los videos leídos.

Dos medidas, separadas porque miden cosas distintas:
  - sobre la persona (`sentiment`): comentarios de videos cuyo título la nombra;
  - en su canal (`own`): comentarios de los últimos videos de su propio canal de YouTube (su audiencia).

Es INCREMENTAL: los textos crudos se borran tras clasificarlos, así que lo que ya estaba publicado en
conversation-sentiment.json solo se reemplaza para las personas que vuelven a leerse en esta corrida.
"""
import json, re, sys, time, unicodedata
from pathlib import Path

HERE = Path(__file__).resolve().parent
ROOT = HERE.parents[2]
sys.path.insert(0, str(HERE.parent / 'company'))
sys.path.insert(0, str(HERE))

from people_io import load_people  # noqa: E402
from analyze_company_social import summary  # noqa: E402
from analyze_person_social import spanish  # noqa: E402
from social_text import TermCounter, fold  # noqa: E402

RAW = ROOT / 'artifacts' / 'people-conversation-raw.jsonl'
DEEP = ROOT / 'artifacts' / 'people-conversation-raw-deep.jsonl'
OWN = ROOT / 'artifacts' / 'people-conversation-raw-own.jsonl'
OWN_SOCIAL = ROOT / 'artifacts' / 'people-conversation-raw-own-social.jsonl'   # TikTok leído con la sesión del usuario
OUT = HERE / 'conversation-sentiment.json'
MIN_COMMENTS = 30
MIN_VIDEOS = 2          # al menos dos videos con comentarios: un solo video mide ese video, no a la persona
MIN_PER_VIDEO = 5


def words(text):
    return re.sub(r'[^a-z0-9 ]', ' ', unicodedata.normalize('NFD', text.lower()).encode('ascii', 'ignore').decode()).split()


def names_person(title, name):
    """El título nombra a la persona: dos nombres seguidos, o primer y último nombre con a lo sumo uno en medio."""
    t, n = words(title), [w for w in words(name) if len(w) > 1]
    if len(n) < 2:
        return False
    pairs = {(n[i], n[i + 1]) for i in range(len(n) - 1)}
    if any((t[i], t[i + 1]) in pairs for i in range(len(t) - 1)):
        return True
    return any(t[i] == n[0] and n[-1] in t[i + 1:i + 3] for i in range(len(t)))


def read_jsonl(path):
    if path.exists():
        for line in path.read_text(encoding='utf8').split('\n'):   # no splitlines(): parte en U+2028
            if line:
                yield json.loads(line)


def measure(videos, name, classifier, keep_title):
    """Videos con sus comentarios → el bloque publicable (sin textos ni autores)."""
    texts, kept = [], []
    for v in videos:
        if not keep_title(v['title']):
            continue
        es = [t for t in v['comments'] if spanish(t)]
        texts.extend(es)
        kept.append({'videoId': v['videoId'], 'title': v['title'], 'published': v['published'],
                     'url': v.get('url') or f'https://www.youtube.com/watch?v={v["videoId"]}',
                     'commentsRead': len(v['comments']), 'commentsSpanish': len(es)})
    labels = classifier.classify(texts) if texts else []
    entry = {'videosRead': len(kept), 'commentsRead': sum(v['commentsRead'] for v in kept),
             'commentsAnalyzed': len(labels), 'videos': kept, 'sentiment': None, 'words': None}
    solid = sum(1 for v in kept if v['commentsSpanish'] >= MIN_PER_VIDEO)
    if len(labels) >= MIN_COMMENTS and solid >= MIN_VIDEOS:
        entry['sentiment'] = summary(labels)
        counter = TermCounter({fold(part) for part in name.split()})
        for t in texts:
            counter.add(t)
        entry['words'] = [r for r in counter.top() if r.get('kind') == 'WORD'][:25]
    return entry


def main():
    names = {p['slug']: p['name'] for p in load_people()}
    previous = json.loads(OUT.read_text(encoding='utf8')) if OUT.exists() else {'people': {}}
    people = dict(previous.get('people', {}))
    overrides = {k: v for k, v in json.loads((HERE / 'conversation-overrides.json').read_text(encoding='utf8')).items() if not k.startswith('_')}

    merged: dict[str, dict[str, dict]] = {}
    for source in (RAW, DEEP):
        for row in read_jsonl(source):
            videos = merged.setdefault(row['slug'], {})
            for v in row['videos']:
                if v['videoId'] not in videos or len(v['comments']) > len(videos[v['videoId']]['comments']):
                    videos[v['videoId']] = v
    # Su público: YouTube (canal propio) y TikTok (videos de su perfil) se suman en un solo bloque por persona.
    own: dict[str, dict] = {}
    for source in (OWN, OWN_SOCIAL):
        for row in read_jsonl(source):
            entry = own.setdefault(row['slug'], {'channel': row['channel'], 'channels': [], 'videos': []})
            entry['channels'].append(row['channel'])
            have = {v['videoId'] for v in entry['videos']}
            entry['videos'].extend(v for v in row['videos'] if v['videoId'] not in have)
    if not merged and not own:
        print('sin lecturas nuevas: el archivo publicado queda igual')
        return

    from sentiment_onnx import Classifier  # noqa: E402  (se carga solo si hay algo que clasificar)
    classifier = Classifier()

    for slug, videos in merged.items():
        if slug not in names:
            continue
        entry = measure(list(videos.values()), names[slug], classifier, lambda title, n=names[slug]: names_person(title, n))
        if overrides.get(slug, {}).get('exclude'):
            entry['sentiment'], entry['words'] = None, None
            entry['excluded'] = overrides[slug]['reason']
        if people.get(slug, {}).get('own'):
            entry['own'] = people[slug]['own']
        people[slug] = entry

    for slug, row in own.items():
        if slug not in names:
            continue
        # En el canal propio no hay que nombrar a la persona en el título: es su canal.
        block = measure(row['videos'], names[slug], classifier, lambda title: True)
        block['channel'] = row['channel']
        block['channels'] = row['channels']
        if overrides.get(slug, {}).get('exclude'):
            block['sentiment'], block['words'] = None, None
        entry = people.setdefault(slug, {'videosRead': 0, 'commentsRead': 0, 'commentsAnalyzed': 0, 'videos': [],
                                         'sentiment': None, 'words': None})
        entry['own'] = block

    doc = {'status': 'YOUTUBE_CONVERSATION_ABOUT_PERSON', 'generatedAt': time.strftime('%Y-%m-%dT%H:%M:%SZ', time.gmtime()),
           'method': {'source': 'Comentarios públicos de YouTube en videos de los últimos 12 meses cuyo título nombra a la persona',
                      'ownSource': 'Comentarios públicos en los últimos videos de su propio canal de YouTube (su audiencia, no quienes hablan de ella)',
                      'model': classifier.name, 'minComments': MIN_COMMENTS,
                      'limits': ['Son los comentarios que se pudieron leer de pocos videos; no representan a toda Bolivia.',
                                 'Mide cómo reaccionan quienes comentan videos sobre la persona, no su propio público.',
                                 'El modelo puede confundir ironía y humor.']},
           'coverage': {'peopleRead': len(people),
                        'peoplePublishable': sum(1 for e in people.values() if e.get('sentiment')),
                        'ownChannelPublishable': sum(1 for e in people.values() if (e.get('own') or {}).get('sentiment')),
                        'commentsAnalyzed': sum(e['commentsAnalyzed'] + (e.get('own') or {}).get('commentsAnalyzed', 0)
                                                for e in people.values())},
           'people': people}
    OUT.write_text(json.dumps(doc, ensure_ascii=False, indent=1), encoding='utf8')
    print(json.dumps(doc['coverage']))


if __name__ == '__main__':
    main()
