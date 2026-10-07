"""Lee la audiencia pública de las cuentas de cada ficha (TikTok y YouTube; sin sesión ni captcha).

Una cifra solo cuenta para el ranking si la cuenta tiene verificación:
  WIKIDATA_DECLARED   la cuenta figura como oficial en la entidad de Wikidata de la persona;
  PLATFORM_VERIFIED   TikTok la marca verificada y el nombre coincide con la ficha;
  SOURCE_LINKED       un sitio oficial, institución o prensa seria enlaza la cuenta (descubrimiento con evidencia) y el
                      nombre mostrado coincide con la ficha;
  HANDLE_MATCHES_WIKIDATA  el usuario de TikTok es el mismo que una cuenta declarada en Wikidata (Instagram, X o
                      Facebook) y el nombre mostrado coincide con la ficha.
Una cuenta que solo coincide por nombre se guarda como NAME_MATCH y no suma. Instagram, X y Facebook
no entregan cifras sin sesión: quedan como pistas sin medir.
"""
import html, json, re, sys, time, unicodedata, urllib.request
from concurrent.futures import ThreadPoolExecutor
from pathlib import Path

from people_io import load_people

HERE = Path(__file__).parent
UA = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/130 Safari/537.36'


def fold(s):
    return re.sub(r'\s+', ' ', re.sub(r'[^a-z0-9]', ' ', unicodedata.normalize('NFKD', s.lower()).encode('ascii', 'ignore').decode())).strip()


def compact(s):
    return fold(s).replace(' ', '')


def alias_match(name, display, handle='', lenient=False):
    """Coincidencia tolerante para apodos y variantes: «Fabru Blacutt», «Mamen Saavedra», «Criss Emprende»."""
    import difflib
    a, b = compact(name), compact(display or '')
    h = compact(handle or '')
    if name_match(name, display or ''):
        return True
    if a and b and (a in b or b in a):
        return True
    if a and h and (a in h or h in a):
        return True
    if a and b and difflib.SequenceMatcher(None, fold(name), fold(display or '')).ratio() >= 0.72:
        return True
    if lenient:
        # Cuenta que una fuente enlaza explícitamente: basta el apellido («Capitán Lara», «Tuto Quiroga») o un usuario casi igual.
        surnames = [t for t in fold(name).split()[1:] if len(t) >= 4]
        if any(t in compact(display or '') or t in h for t in surnames):
            return True
        if a and h and difflib.SequenceMatcher(None, a, h).ratio() >= 0.85:
            return True
    return False


def name_match(person, label):
    a, b = set(fold(person).split()), set(fold(label).split())
    if not a or not b:
        return False
    short = a if len(a) <= len(b) else b
    return len(a & b) >= min(2, len(short)) and len(a & b) / len(short) >= 0.66


CRAWLER_UA = 'facebookexternalhit/1.1 (+http://www.facebook.com/externalhit_uatext.php)'


def fetch(url, lang='es-BO,es', ua=UA):
    for i in range(3):
        try:
            req = urllib.request.Request(url, headers={'User-Agent': ua, 'Accept-Language': lang})
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
    if not m.group(2) and re.fullmatch(r'\d{1,3}(?:[.,]\d{3})+', m.group(1)):
        return int(re.sub(r'[.,]', '', m.group(1)))      # 225.262 / 1,434: separador de miles, no decimal
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


def og_description(url, lang='es-BO,es'):
    h = fetch(url, lang=lang, ua=CRAWLER_UA)
    m = h and re.search(r'og:description"\s+content="([^"]*)"', h)
    return html.unescape(m.group(1)).replace(' ', ' ') if m else None


def instagram(handle):
    d = og_description(f'https://www.instagram.com/{handle}/', lang='en-US,en')
    m = d and re.match(r'([\d.,]+\s*[KMkm]?)\s*Followers', d)
    if not m:
        return None
    who = re.search(r'from (.*?) \(@', d)
    return {'platform': 'instagram', 'handle': handle, 'displayName': who.group(1) if who else None, 'verifiedBadge': False,
            'followers': parse_count(m.group(1)), 'url': f'https://www.instagram.com/{handle}/'}


def facebook(handle):
    d = og_description(f'https://www.facebook.com/{handle}')
    m = d and re.match(r'(.*?)\.\s*([\d.,]+\s*[KMkm]?)\s*(?:seguidores|followers)', d)
    if not m:
        return None
    return {'platform': 'facebook', 'handle': handle, 'displayName': m.group(1), 'verifiedBadge': False,
            'followers': parse_count(m.group(2)), 'url': f'https://www.facebook.com/{handle}'}


def discovered():
    found = {}
    for f in sorted((HERE / 'discovery').glob('output-*.json')):
        try:
            for row in json.loads(f.read_text(encoding='utf8')):
                cur = found.setdefault(row['slug'], {'slug': row['slug'], 'accounts': {}, 'evidence': []})
                for plat, handle in (row.get('accounts') or {}).items():
                    cur['accounts'].setdefault(plat, handle)
                cur['evidence'] = list(dict.fromkeys(cur['evidence'] + (row.get('evidence') or [])))
        except Exception:
            continue
    return found


def handle_of(url):
    m = re.search(r'tiktok\.com/@([\w.]+)', url)
    return m.group(1) if m else None


def run(person, attention, source=None):
    wd = (attention or {}).get('accounts', {})
    targets = []
    src = (source or {}).get('accounts', {})
    for plat in ('instagram', 'facebook'):
        if wd.get(plat):
            targets.append((plat, wd[plat], 'wd'))
    for plat in ('instagram', 'facebook', 'tiktok'):
        if src.get(plat):
            targets.append((plat, str(src[plat]).lstrip('@'), 'src'))
    if src.get('youtube'):
        y = str(src['youtube'])
        targets.append(('youtube', y if y.startswith('http') else (f'https://www.youtube.com/channel/{y}' if y.startswith('UC') else f'https://www.youtube.com/@{y.lstrip("@")}'), 'src'))
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
        r = {'tiktok': tiktok, 'youtube': youtube, 'instagram': instagram, 'facebook': facebook}[plat](ref)
        time.sleep(1.2)
        if not r or r.get('followers') is None:
            continue
        if origin == 'guess':
            if r['handle'] and alias_match(person['name'], r['displayName'], r['handle']):
                # El mismo usuario en otra red no prueba titularidad: puede ser alguien que se apropió del usuario.
                r['verification'] = 'HANDLE_MATCHES_WIKIDATA' if (r['verifiedBadge'] or (r['followers'] or 0) >= 5000) else 'HANDLE_UNCONFIRMED_SMALL'
                out.append(r)
            continue
        if origin == 'src':
            r['verification'] = 'SOURCE_LINKED' if alias_match(person['name'], r['displayName'], r['handle'] or '', lenient=True) else 'NAME_MISMATCH'
            r['evidence'] = (source or {}).get('evidence', [])
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
    people = load_people()
    att = {r['slug']: r for r in json.load(open(HERE / 'attention.json', encoding='utf8'))['people']}
    src = discovered()
    overrides = {k: v for k, v in json.load(open(HERE / 'identity-overrides.json', encoding='utf8')).items() if not k.startswith('_')}
    for slug, ov in overrides.items():
        if ov.get('identity') == 'REJECT':
            att[slug] = {'slug': slug, 'status': 'REJECTED'}
    people = [p for p in people if not overrides.get(p['slug'], {}).get('outOfScope') and not overrides.get(p['slug'], {}).get('duplicateOf')]
    only = sys.argv[1:]
    if only:
        people = [p for p in people if p['slug'] in only]
    with ThreadPoolExecutor(max_workers=2) as ex:
        rows = list(ex.map(lambda p: run(p, att.get(p['slug']), src.get(p['slug'])), people))
    if only and (HERE / 'social-audience.json').exists():
        current = {r['slug']: r for r in json.load(open(HERE / 'social-audience.json', encoding='utf8'))['people']}
        current.update({r['slug']: r for r in rows})
        rows = list(current.values())
    json.dump({'generatedAt': time.strftime('%Y-%m-%dT%H:%M:%SZ', time.gmtime()), 'people': rows},
              open(HERE / 'social-audience.json', 'w', encoding='utf8'), ensure_ascii=False, indent=1)
    acc = [a for r in rows for a in r['accounts']]
    from collections import Counter
    print(len(rows), 'personas;', len(acc), 'cuentas leídas;', dict(Counter(a['verification'] for a in acc)))


if __name__ == '__main__':
    main()
