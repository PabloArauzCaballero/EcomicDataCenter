"""Descubre cuentas oficiales a partir de lo que la propia persona o Wikipedia enlazan.

Para cada ficha con entidad en Wikidata: lee el sitio oficial (P856) y busca enlaces a redes; añade los enlaces
externos de su artículo de Wikipedia (es y en). Cada cuenta lleva la URL donde se encontró como evidencia.
Escribe discovery/output-site.json con el mismo formato que la revisión manual por lotes.
"""
import json, re, time, urllib.parse, urllib.request
from concurrent.futures import ThreadPoolExecutor
from pathlib import Path

HERE = Path(__file__).parent
UA = 'ObservatorioBolivia/1.0 (https://test.datosbolivia.com; pabliarca@gmail.com)'
BROWSER = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/130 Safari/537.36'
SKIP = {'share', 'sharer', 'sharer.php', 'intent', 'p', 'reel', 'reels', 'explore', 'hashtag', 'watch', 'embed', 'home', 'tr', 'plugins',
        'dialog', 'login', 'policies', 'privacy', 'about', 'help', 'legal', 'groups', 'events', 'pages', 'photo', 'photo.php', 'profile.php'}
PATTERNS = {
    'instagram': re.compile(r'instagram\.com/(?!p/|reel|explore)([A-Za-z0-9._]{2,30})', re.I),
    'facebook': re.compile(r'facebook\.com/(?!sharer|share|plugins|dialog|tr\?)([A-Za-z0-9.\-]{3,60})', re.I),
    'tiktok': re.compile(r'tiktok\.com/@([A-Za-z0-9._]{2,30})', re.I),
    'youtube': re.compile(r'youtube\.com/(channel/UC[\w-]{22}|@[\w.\-]{3,40})', re.I),
    'twitter': re.compile(r'(?:twitter|x)\.com/(?!intent|share|home|i/)([A-Za-z0-9_]{2,15})', re.I),
}


def get(url, ua=UA, as_json=True, timeout=25):
    for i in range(3):
        try:
            req = urllib.request.Request(url, headers={'User-Agent': ua})
            with urllib.request.urlopen(req, timeout=timeout) as r:
                body = r.read().decode('utf8', 'replace')
            return json.loads(body) if as_json else body
        except Exception:
            time.sleep(1.2 * (i + 1))
    return None


def socials(text):
    out = {}
    for plat, rx in PATTERNS.items():
        for m in rx.finditer(text):
            h = m.group(1).rstrip('.')
            if h.lower() in SKIP or h.lower().endswith(('.php', '.png', '.jpg')):
                continue
            out.setdefault(plat, h)
            break
    return out


def one(row):
    slug, qid, es_title, en_title = row
    found, evidence = {}, []
    ent = (get('https://www.wikidata.org/w/api.php?' + urllib.parse.urlencode(
        {'action': 'wbgetentities', 'ids': qid, 'props': 'claims', 'format': 'json'})) or {}).get('entities', {}).get(qid, {})
    sites = []
    for c in ent.get('claims', {}).get('P856', []):
        v = c.get('mainsnak', {}).get('datavalue', {}).get('value')
        if isinstance(v, str):
            sites.append(v)
    for site in sites[:2]:
        html = get(site, ua=BROWSER, as_json=False)
        if html:
            hit = socials(html)
            if hit:
                for k, v in hit.items():
                    found.setdefault(k, v)
                evidence.append(site)
    for lang, title in (('es', es_title), ('en', en_title)):
        if not title:
            continue
        d = get(f'https://{lang}.wikipedia.org/w/api.php?' + urllib.parse.urlencode(
            {'action': 'query', 'prop': 'extlinks', 'titles': title, 'ellimit': 100, 'format': 'json'}))
        links = ' '.join(l.get('*', '') for p in (d or {}).get('query', {}).get('pages', {}).values() for l in p.get('extlinks', []))
        hit = socials(links)
        if hit:
            for k, v in hit.items():
                found.setdefault(k, v)
            evidence.append(f'https://{lang}.wikipedia.org/wiki/{urllib.parse.quote(title.replace(" ", "_"))}')
    return {'slug': slug, 'accounts': found, 'evidence': evidence, 'note': 'sitio oficial y enlaces de Wikipedia'}


def main():
    att = json.loads((HERE / 'attention.json').read_text(encoding='utf8'))['people']
    rows = [(a['slug'], a['wikidata'], a.get('wikipediaEs'), a.get('wikipediaEn')) for a in att if a.get('wikidata')]
    with ThreadPoolExecutor(max_workers=6) as ex:
        out = list(ex.map(one, rows))
    (HERE / 'discovery' / 'output-site.json').write_text(json.dumps(out, ensure_ascii=False, indent=1), encoding='utf8')
    print(len(out), 'personas;', sum(1 for r in out if r['accounts']), 'con alguna cuenta enlazada')


if __name__ == '__main__':
    main()
