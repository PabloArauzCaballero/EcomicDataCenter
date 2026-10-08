"""Videos recientes sobre una persona y sus comentarios públicos de YouTube, sin sesión ni navegador.

Lee la página de resultados (filtro «este año»), conserva solo videos cuyo título nombra a la persona y
pide los comentarios por la API interna de la propia página. No guarda autores ni identificadores de
comentaristas: solo el texto, que se clasifica y se descarta.
"""
import json, re, time, unicodedata, urllib.parse, urllib.request

UA = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/130 Safari/537.36'
HEAD = {'User-Agent': UA, 'Accept-Language': 'es-BO,es;q=0.9', 'Cookie': 'CONSENT=YES+1; SOCS=CAI'}


def fold(s):
    return re.sub(r'[^a-z0-9 ]', ' ', unicodedata.normalize('NFD', s.lower()).encode('ascii', 'ignore').decode()).strip()


def http(url, data=None, tries=3):
    for i in range(tries):
        try:
            req = urllib.request.Request(url, data=data, headers=HEAD | ({'Content-Type': 'application/json'} if data else {}))
            with urllib.request.urlopen(req, timeout=30) as r:
                return r.read().decode('utf8', 'replace')
        except Exception:
            time.sleep(1.5 * (i + 1))
    return None


def initial_data(html):
    m = re.search(r'var ytInitialData = (\{.*?\});</script>', html, re.S)
    return json.loads(m.group(1)) if m else None


def walk(node, key):
    if isinstance(node, dict):
        for k, v in node.items():
            if k == key:
                yield v
            yield from walk(v, key)
    elif isinstance(node, list):
        for v in node:
            yield from walk(v, key)


def search_videos(name, limit=4):
    q = urllib.parse.quote(f'"{name}" Bolivia')
    html = http(f'https://www.youtube.com/results?search_query={q}&sp=EgIIBQ%253D%253D')
    data = initial_data(html) if html else None
    if not data:
        return []
    tokens = [t for t in fold(name).split() if len(t) > 2]
    out = []
    for v in walk(data, 'videoRenderer'):
        title = ''.join(r.get('text', '') for r in v.get('title', {}).get('runs', []))
        if not tokens or not all(t in fold(title) for t in tokens[:1] + tokens[-1:]):
            continue
        out.append({'id': v['videoId'], 'title': title, 'published': v.get('publishedTimeText', {}).get('simpleText')})
        if len(out) >= limit:
            break
    return out


def comments(video_id, cap=120):
    html = http(f'https://www.youtube.com/watch?v={video_id}')
    if not html:
        return []
    data = initial_data(html)
    key = re.search(r'"INNERTUBE_API_KEY":"([^"]+)"', html)
    ver = re.search(r'"INNERTUBE_CLIENT_VERSION":"([^"]+)"', html)
    if not data or not key:
        return []
    token = None
    for sec in walk(data, 'itemSectionRenderer'):
        if sec.get('sectionIdentifier') == 'comment-item-section' or 'comments' in json.dumps(sec.get('targetId', '')):
            for t in walk(sec, 'token'):
                token = t
                break
        if token:
            break
    if not token:
        for t in walk(data, 'continuationCommand'):
            token = t.get('token')
            break
    if not token:
        return []
    texts = []
    for _ in range(8):
        body = json.dumps({'context': {'client': {'clientName': 'WEB', 'clientVersion': ver.group(1) if ver else '2.20260101.00.00', 'hl': 'es', 'gl': 'BO'}},
                           'continuation': token}).encode()
        raw = http(f'https://www.youtube.com/youtubei/v1/next?key={key.group(1)}', data=body)
        if not raw:
            break
        j = json.loads(raw)
        for mut in walk(j, 'commentEntityPayload'):
            t = mut.get('properties', {}).get('content', {}).get('content')
            if t:
                texts.append(t)
        for cr in walk(j, 'commentRenderer'):
            t = ''.join(r.get('text', '') for r in cr.get('contentText', {}).get('runs', []))
            if t:
                texts.append(t)
        if len(texts) >= cap:
            break
        nxt = None
        for items in walk(j, 'continuationItems'):
            if items and 'continuationItemRenderer' in items[-1]:
                nxt = items[-1]['continuationItemRenderer'].get('continuationEndpoint', {}).get('continuationCommand', {}).get('token')
        if not nxt or nxt == token:
            break
        token = nxt
        time.sleep(0.8)
    return texts[:cap]


if __name__ == '__main__':
    import sys
    name = ' '.join(sys.argv[1:]) or 'Rodrigo Paz'
    vids = search_videos(name)
    print(len(vids), 'videos')
    for v in vids[:2]:
        c = comments(v['id'])
        print(v['title'][:70], '|', len(c), 'comentarios |', c[:2])
