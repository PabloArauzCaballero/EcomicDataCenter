"""Clasifica los comentarios recogidos por collect_conversation.py y publica solo agregados.

Corre con el Python del entorno social (~/.observatorio-social/venv). Un comentario cuenta si está en
español (>= 0,7, cuatro palabras o más). Una persona publica sentimiento con al menos 30 comentarios
clasificados. No sale ningún texto ni autor: solo porcentajes, palabras frecuentes y los videos leídos.
"""
import json, sys, time
from collections import defaultdict
from pathlib import Path

HERE = Path(__file__).resolve().parent
ROOT = HERE.parents[2]
sys.path.insert(0, str(HERE.parent / 'company'))
sys.path.insert(0, str(HERE))

from analyze_company_social import summary  # noqa: E402
from analyze_person_social import spanish  # noqa: E402
from sentiment_onnx import Classifier  # noqa: E402
from social_text import TermCounter, fold  # noqa: E402

RAW = ROOT / 'artifacts' / 'people-conversation-raw.jsonl'
OUT = HERE / 'conversation-sentiment.json'
MIN_COMMENTS = 30


def main():
    names = {p['slug']: p['name'] for p in json.loads((HERE / 'research-300.json').read_text(encoding='utf8'))['people']}
    rows = [json.loads(line) for line in RAW.read_text(encoding='utf8').splitlines() if line]
    classifier = Classifier()
    people = {}
    for row in rows:
        slug = row['slug']
        texts, videos = [], []
        for v in row['videos']:
            es = [t for t in v['comments'] if spanish(t)]
            texts.extend(es)
            videos.append({'videoId': v['videoId'], 'title': v['title'], 'published': v['published'],
                           'url': f'https://www.youtube.com/watch?v={v["videoId"]}', 'commentsRead': len(v['comments']), 'commentsSpanish': len(es)})
        labels = classifier.classify(texts) if texts else []
        entry = {'videosRead': len(videos), 'commentsRead': sum(v['commentsRead'] for v in videos),
                 'commentsAnalyzed': len(labels), 'videos': videos, 'sentiment': None, 'words': None}
        if len(labels) >= MIN_COMMENTS:
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
