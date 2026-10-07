"""Lee la audiencia pública de las cuentas de cada ficha (TikTok y YouTube; sin sesión ni captcha).

Una cifra solo cuenta para el ranking si la cuenta tiene verificación:
  WIKIDATA_DECLARED   la cuenta figura como oficial en la entidad de Wikidata de la persona;
  PLATFORM_VERIFIED   TikTok la marca verificada y el nombre coincide con la ficha;
  HANDLE_MATCHES_WIKIDATA  el usuario de TikTok es el mismo que una cuenta declarada en Wikidata (Instagram, X o
                      Facebook) y el nombre mostrado coincide con la ficha.
Una cuenta que solo coincide por nombre se guarda como NAME_MATCH y no suma. Instagram, X y Facebook
no entregan cifras sin sesión: quedan como pistas sin medir.
"""
import json, re, sys, time, unicodedata, urllib.request
from concurrent.futures import ThreadPoolExecutor
from pathlib import Path

HERE = Path(__file__).parent
UA = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/130 Safari/537.36'


def fold(s):
    return re.sub(r'[^a-z0-9 ]', '', unicodedata.normalize('NFD', s.lower()).encode('ascii', 'ignore').decode()).strip()


def name_match(person, label):
    a, b = set(fold(person).split()), set(fold(label).split())
    if not a or not b:
        return False
    short = a if len(a) <= len(b) else b
    return len(a & b) >= min(2, len(short)) and len(a & b) / len(short) >= 0.66


def fetch(url, lang='es-BO,es'):
    for i in range(3):
        try:
            req = urllib.request.Request(url, headers={'User-Agent': UA, 'Accept-Language': lang})
            with urllib.request.urlopen(req, timeout=30) as r:
                return r.read().decode('utf8', 'replace')
        except urllib.error.HTTPError as e:
            if e.code in (404, 400):
                return None
            time.sleep(2 * (i + 1))
        except Exception:
            time.sleep(2 * (i + 1))
    return None


def parse_count(text):
    m = re.match(r'([\d.,]+)\s*([KMkm]|mil|millones)?', text.strip())
    if not m:
        return None
    n = float(m.group(1).replace(',', '.')) if m.group(1).count('.') + m.group(1).count(',') <= 1 else float(re.sub(r'[.,]', '', m.group(1)))
    mult = {'k': 1e3, 'mil': 1e3, 'm': 1e6, 'millones': 1e6}.get((m.group(2) or '').lower(), 1)
    return int(round(n * mult))


def tiktok(handle):
    m = None
    for attempt in range(4):
        h = fetch(f'https://www.tiktok.com/@{handle}')
        if not h:
            return None
        m = re.search(r'<script id="__UNIVERSAL_DATA_FOR_REHYDRATION__"[^>]*>(.*?)</script>', h, re.S)
        if m:
            break
        time.sleep(3 * (attempt + 1))
    if not m:
        return None
    try:
        info = json.loads(m.group(1))['__DEFAULT_SCOPE__']['webapp.user-detail']['userInfo']
    except Exception:
        return None
    u, s = info.get('user', {}), info.get('stats', {})
    if not s:
        return None
    return {'platform': 'tiktok', 'handle': u.get('uniqueId'), 'displayName': u.get('nickname'), 'verifiedBadge': bool(u.get('verified')),
            'followers': s.get('followerCount'), 'likes': s.get('heartCount'), 'videos': s.get('videoCount'),
            'url': f'https://www.tiktok.com/@{u.get("uniqueId")}'}


def youtube(channel_url):
    h = fetch(channel_url)
    if not h:
        return None
    t = re.search(r'<meta property="og:title" content="([^"]*)"', h)
    s = re.search(r'"content":"([\d.,]+\s*[KMkm]?|[\d.,]+\s*mil)\s*suscriptores?"', h) or re.search(r'"content":"([\d.,]+\s*[KMkm]?)\s*subscribers?"', h)
    cid = re.search(r'<link rel="canonical" href="https://www\.youtube\.com/channel/(UC[\w-]{22})"', h) or re.search(r'/channel/(UC[\w-]{22})', channel_url)
    if not t or not s:
        return None
    return {'platform': 'youtube', 'handle': cid.group(1) if cid else None, 'displayName': re.sub('&amp;', '&', t.group(1)),
            'verifiedBadge': False, 'followers': parse_count(s.group(1)), 'url': channel_url}


def handle_of(url):
    m = re.search(r'tiktok\.com/@([\w.]+)', url)
    return m.group(1) if m else None


def run(person, attention):
    wd = (attention or {}).get('accounts', {})
    targets = []
    if wd.get('tiktok'):
        targets.append(('tiktok', wd['tiktok'], 'wd'))
    if wd.get('youtube'):
        targets.append(('youtube', f'https://www.youtube.com/channel/{wd["youtube"]}', 'wd'))
    for plat in ('instagram', 'twitter', 'facebook'):
        if wd.get(plat):
            targets.append(('tiktok', wd[plat], 'guess'))
    for lead in person.get('accountLeads', []):
        if lead['platform'] == 'tiktok' and handle_of(lead['url']):
            targets.append(('tiktok', handle_of(lead['url']), 'lead'))
        elif lead['platform'] == 'youtube':
            targets.append(('youtube', lead['url'], 'lead'))
    seen, out = set(), []
    for plat, ref, origin in targets:
        key = (plat, ref.lower())
        if key in seen:
            continue
        seen.add(key)
        r = tiktok(ref) if plat == 'tiktok' else youtube(ref)
        time.sleep(1.2)
        if not r or r.get('followers') is None:
            continue
        if origin == 'guess':
            if r['handle'] and name_match(person['name'], r['displayName'] or ''):
                r['verification'] = 'HANDLE_MATCHES_WIKIDATA'
                out.append(r)
            continue
        declared = origin == 'wd' or (plat == 'tiktok' and (r['handle'] or '').lower() == (wd.get('tiktok') or '').lower()) \
            or (plat == 'youtube' and r['handle'] == wd.get('youtube'))
        named = name_match(person['name'], r['displayName'] or '')
        if declared:
            r['verification'] = 'WIKIDATA_DECLARED'
        elif plat == 'tiktok' and r['verifiedBadge'] and named:
            r['verification'] = 'PLATFORM_VERIFIED'
        elif named:
            r['verification'] = 'NAME_MATCH'
        else:
            r['verification'] = 'NAME_MISMATCH'
        out.append(r)
    return {'slug': person['slug'], 'accounts': out}


def main():
    people = json.load(open(HERE / 'research-300.json', encoding='utf8'))['people']
    att = {r['slug']: r for r in json.load(open(HERE / 'attention.json', encoding='utf8'))['people']}
    only = sys.argv[1:]
    if only:
        people = [p for p in people if p['slug'] in only]
    with ThreadPoolExecutor(max_workers=2) as ex:
        rows = list(ex.map(lambda p: run(p, att.get(p['slug'])), people))
    json.dump({'generatedAt': time.strftime('%Y-%m-%dT%H:%M:%SZ', time.gmtime()), 'people': rows},
              open(HERE / 'social-audience.json', 'w', encoding='utf8'), ensure_ascii=False, indent=1)
    acc = [a for r in rows for a in r['accounts']]
    from collections import Counter
    print(len(rows), 'personas;', len(acc), 'cuentas leídas;', dict(Counter(a['verification'] for a in acc)))


if __name__ == '__main__':
    main()
