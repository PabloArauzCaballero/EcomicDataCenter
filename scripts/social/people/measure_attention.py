"""Mide la atención pública de cada ficha del padrón con fuentes abiertas y trazables.

Para cada persona: resuelve su entidad en Wikidata (solo si la descripción o la ciudadanía es
boliviana), lee fecha de nacimiento y cuentas oficiales declaradas (P2002/P2003/P2397/P2013/P7085),
y suma las visitas de los últimos 12 meses a sus artículos de Wikipedia (es + en).
Guarda un archivo con el detalle por persona; no ordena nada: el orden lo arma rank_people.py.
"""
import json, re, sys, time, unicodedata, urllib.parse, urllib.request
from concurrent.futures import ThreadPoolExecutor
from pathlib import Path

from people_io import load_people

HERE = Path(__file__).parent
OUT = HERE / 'attention.json'
UA = 'ObservatorioBolivia/1.0 (https://test.datosbolivia.com; pabliarca@gmail.com)'
WINDOW = ('20251001', '20260930')
HANDLES = {'P2002': 'twitter', 'P2003': 'instagram', 'P2397': 'youtube', 'P2013': 'facebook', 'P7085': 'tiktok', 'P4264': 'linkedin'}


def get(url, tries=4):
    for i in range(tries):
        try:
            req = urllib.request.Request(url, headers={'User-Agent': UA})
            with urllib.request.urlopen(req, timeout=30) as r:
                return json.loads(r.read().decode('utf8'))
        except urllib.error.HTTPError as e:
            if e.code == 404:
                return None
            time.sleep(1.5 * (i + 1))
        except Exception:
            time.sleep(1.5 * (i + 1))
    return None


def fold(s):
    return re.sub(r'[^a-z0-9 ]', '', unicodedata.normalize('NFD', s.lower()).encode('ascii', 'ignore').decode()).strip()


def name_match(person, label):
    a, b = set(fold(person).split()), set(fold(label).split())
    if not a or not b:
        return False
    short, long_ = (a, b) if len(a) <= len(b) else (b, a)
    return len(short & long_) >= min(2, len(short)) and len(short & long_) / len(short) >= 0.66


def candidates(name):
    seen = {}
    for lang in ('es', 'en'):
        q = urllib.parse.urlencode({'action': 'wbsearchentities', 'search': name, 'language': lang, 'uselang': lang,
                                    'limit': 8, 'format': 'json', 'type': 'item'})
        d = get('https://www.wikidata.org/w/api.php?' + q) or {}
        for it in d.get('search', []):
            seen.setdefault(it['id'], it)
    return list(seen.values())


def entity(qid):
    q = urllib.parse.urlencode({'action': 'wbgetentities', 'ids': qid, 'format': 'json',
                                'props': 'claims|sitelinks|labels|descriptions'})
    d = get('https://www.wikidata.org/w/api.php?' + q) or {}
    return (d.get('entities') or {}).get(qid)


def claim_ids(ent, prop):
    out = []
    for c in ent.get('claims', {}).get(prop, []):
        v = c.get('mainsnak', {}).get('datavalue', {}).get('value')
        out.append(v['id'] if isinstance(v, dict) and 'id' in v else v)
    return out


def views(project, title):
    t = urllib.parse.quote(title.replace(' ', '_'), safe='')
    d = get(f'https://wikimedia.org/api/rest_v1/metrics/pageviews/per-article/{project}/all-access/user/{t}/monthly/{WINDOW[0]}/{WINDOW[1]}')
    return sum(i['views'] for i in d['items']) if d else None


def measure(person):
    name = person['name']
    best = None
    for c in candidates(name):
        desc = (c.get('description') or '')
        label = c.get('label') or ''
        if not name_match(name, label) and not any(name_match(name, a) for a in [m.get('value', '') for m in [c.get('match', {})]]):
            continue
        ent = entity(c['id'])
        if not ent or 'Q5' not in claim_ids(ent, 'P31'):
            continue
        bolivian = 'Q750' in claim_ids(ent, 'P27') or re.search(r'bolivi', desc, re.I)
        if not bolivian:
            continue
        links = len(ent.get('sitelinks', {}))
        if best is None or links > best[1]:
            best = (ent, links, c)
    if not best:
        return {'slug': person['slug'], 'status': 'NO_WIKIDATA_MATCH'}
    ent, links, c = best
    birth = None
    for cl in ent.get('claims', {}).get('P569', []):
        v = cl.get('mainsnak', {}).get('datavalue', {}).get('value')
        if v:
            birth = v['time'][1:11]
    accounts = {}
    for prop, plat in HANDLES.items():
        v = claim_ids(ent, prop)
        if v:
            accounts[plat] = v[0]
    sl = ent.get('sitelinks', {})
    es_title = sl.get('eswiki', {}).get('title')
    en_title = sl.get('enwiki', {}).get('title')
    return {
        'slug': person['slug'], 'status': 'MATCHED', 'wikidata': ent['id'], 'label': c.get('label'),
        'description': c.get('description'), 'birth': birth, 'sitelinks': links,
        'wikipediaEs': es_title, 'wikipediaEn': en_title,
        'viewsEs': views('es.wikipedia', es_title) if es_title else None,
        'viewsEn': views('en.wikipedia', en_title) if en_title else None,
        'accounts': accounts,
    }


def retry_views():
    """Las visitas que fallaron por límite de la API quedaron en None: se piden de nuevo, más despacio."""
    doc = json.load(open(OUT, encoding='utf8'))
    fixed = 0
    for r in doc['people']:
        if r.get('status') != 'MATCHED':
            continue
        for key, proj, title in (('viewsEs', 'es.wikipedia', r.get('wikipediaEs')), ('viewsEn', 'en.wikipedia', r.get('wikipediaEn'))):
            if title and r.get(key) is None:
                for _ in range(3):
                    time.sleep(1.0)
                    v = views(proj, title)
                    if v is not None:
                        r[key] = v
                        fixed += 1
                        break
    json.dump(doc, open(OUT, 'w', encoding='utf8'), ensure_ascii=False, indent=1)
    still = sum(1 for r in doc['people'] if r.get('status') == 'MATCHED' and ((r.get('wikipediaEs') and r.get('viewsEs') is None) or (r.get('wikipediaEn') and r.get('viewsEn') is None)))
    print(fixed, 'lecturas recuperadas;', still, 'siguen sin dato (artículo sin visitas registradas)')


def retry_unmatched():
    """Fichas sin entidad: se repite la búsqueda por si la API de Wikidata falló en la primera pasada."""
    doc = json.load(open(OUT, encoding='utf8'))
    people = {p['slug']: p for p in load_people()}
    todo = [people[r['slug']] for r in doc['people'] if r['status'] == 'NO_WIKIDATA_MATCH']
    with ThreadPoolExecutor(max_workers=2) as ex:
        again = {r['slug']: r for r in ex.map(measure, todo)}
    doc['people'] = [again.get(r['slug'], r) for r in doc['people']]
    json.dump(doc, open(OUT, 'w', encoding='utf8'), ensure_ascii=False, indent=1)
    print(len(todo), 'reintentadas;', sum(1 for r in again.values() if r['status'] == 'MATCHED'), 'ahora con entidad')


def main():
    if '--retry-unmatched' in sys.argv:
        return retry_unmatched()
    if '--retry-views' in sys.argv:
        return retry_views()
    people = load_people()
    only = [a for a in sys.argv[1:] if not a.startswith('--')]
    if only:
        people = [p for p in people if p['slug'] in only]
    with ThreadPoolExecutor(max_workers=6) as ex:
        rows = list(ex.map(measure, people))
    if only and OUT.exists():
        # Con slugs concretos se completa el archivo existente en vez de reemplazarlo.
        current = {r['slug']: r for r in json.load(open(OUT, encoding='utf8'))['people']}
        current.update({r['slug']: r for r in rows})
        rows = list(current.values())
    json.dump({'generatedAt': time.strftime('%Y-%m-%dT%H:%M:%SZ', time.gmtime()), 'window': WINDOW, 'people': rows},
              open(OUT, 'w', encoding='utf8'), ensure_ascii=False, indent=1)
    m = [r for r in rows if r['status'] == 'MATCHED']
    print(len(rows), 'personas;', len(m), 'con entidad;', sum(1 for r in m if (r.get('viewsEs') or 0) + (r.get('viewsEn') or 0) > 0), 'con visitas')


if __name__ == '__main__':
    main()
