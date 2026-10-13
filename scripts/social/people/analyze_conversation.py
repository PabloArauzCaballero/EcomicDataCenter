"""Clasifica los comentarios recogidos por collect_conversation.py y publica solo agregados.

Corre con el Python del entorno social (~/.observatorio-social/venv). Un comentario cuenta si está en
español (>= 0,7, cuatro palabras o más). Una persona publica sentimiento con al menos 30 comentarios
clasificados. No sale ningún texto ni autor: solo porcentajes, palabras frecuentes y los videos leídos.
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
from sentiment_onnx import Classifier  # noqa: E402
from social_text import TermCounter, fold  # noqa: E402

RAW = ROOT / 'artifacts' / 'people-conversation-raw.jsonl'
DEEP = ROOT / 'artifacts' / 'people-conversation-raw-deep.jsonl'
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


def main():
    names = {p['slug']: p['name'] for p in load_people()}
    merged: dict[str, dict[str, dict]] = {}
    for source in (RAW, DEEP):
        if not source.exists():
            continue
        for line in source.read_text(encoding='utf8').splitlines():
            if not line:
                continue
            row = json.loads(line)
            videos = merged.setdefault(row['slug'], {})
            for v in row['videos']:
                if v['videoId'] not in videos or len(v['comments']) > len(videos[v['videoId']]['comments']):
                    videos[v['videoId']] = v
    rows = [{'slug': slug, 'videos': list(videos.values())} for slug, videos in merged.items()]
    overrides = {k: v for k, v in json.loads((HERE / 'conversation-overrides.json').read_text(encoding='utf8')).items() if not k.startswith('_')}
    classifier = Classifier()
    people = {}
    for row in rows:
        slug = row['slug']
        texts, videos = [], []
        for v in row['videos']:
            if not names_person(v['title'], names[slug]):
                continue
            es = [t for t in v['comments'] if spanish(t)]
            texts.extend(es)
            videos.append({'videoId': v['videoId'], 'title': v['title'], 'published': v['published'],
                           'url': f'https://www.youtube.com/watch?v={v["videoId"]}', 'commentsRead': len(v['comments']), 'commentsSpanish': len(es)})
        labels = classifier.classify(texts) if texts else []
        entry = {'videosRead': len(videos), 'commentsRead': sum(v['commentsRead'] for v in videos),
                 'commentsAnalyzed': len(labels), 'videos': videos, 'sentiment': None, 'words': None}
        solid = sum(1 for v in videos if v['commentsSpanish'] >= MIN_PER_VIDEO)
        if overrides.get(slug, {}).get('exclude'):
            entry['excluded'] = overrides[slug]['reason']
        elif len(labels) >= MIN_COMMENTS and solid >= MIN_VIDEOS:
            entry['sentiment'] = summary(labels)
            counter = TermCounter({fold(part) for part in names[slug].split()})
            for t in texts:
                counter.add(t)
            entry['words'] = [r for r in counter.top() if r.get('kind') == 'WORD'][:25]
        people[slug] = entry
    publishable = sum(1 for e in people.values() if e['sentiment'])
    doc = {'status': 'YOUTUBE_CONVERSATION_ABOUT_PERSON', 'generatedAt': time.strftime('%Y-%m-%dT%H:%M:%SZ', time.gmtime()),
           'method': {'source': 'Comentarios públicos de YouTube en videos de los últimos 12 meses cuyo título nombra a la persona',
                      'model': classifier.name, 'minComments': MIN_COMMENTS,
                      'limits': ['Son los comentarios que se pudieron leer de pocos videos; no representan a toda Bolivia.',
                                 'Mide cómo reaccionan quienes comentan videos sobre la persona, no su propio público.',
                                 'El modelo puede confundir ironía y humor.']},
           'coverage': {'peopleRead': len(people), 'peoplePublishable': publishable,
                        'commentsAnalyzed': sum(e['commentsAnalyzed'] for e in people.values())},
           'people': people}
    OUT.write_text(json.dumps(doc, ensure_ascii=False, indent=1), encoding='utf8')
    print(json.dumps(doc['coverage']))


if __name__ == '__main__':
    main()
