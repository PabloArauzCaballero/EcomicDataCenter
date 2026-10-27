"""BBV participantes del mercado -> raw json."""
import re, html, json, sys, time, urllib.request, urllib.parse
BASE = 'https://www.bbv.com.bo'


def fetch(u):
    for i in range(3):
        try:
            return urllib.request.urlopen(urllib.request.Request(u, headers={'User-Agent': 'Mozilla/5.0'}), timeout=60).read().decode('utf-8', 'replace')
        except Exception as e:
            print('retry', u, e); time.sleep(5)
    return ''


def text(s):
    s = re.sub(r'(?is)<(script|style)\b.*?</\1>', '', s)
    s = re.sub(r'(?i)<(br|/p|/li|/h\d|/div)\b[^>]*>', '\n', s)
    t = html.unescape(re.sub(r'<[^>]+>', ' ', s))
    return [' '.join(l.split()) for l in t.splitlines() if l.strip()]


s = open(sys.argv[1], encoding='utf-8', errors='replace').read()
out, seen = [], set()
for blk in re.finditer(r'(?is)<h4 class="emisores__title">(.*?)</h4>(.*?)</ul>', s):
    sector = html.unescape(blk.group(1)).strip()
    for href, name in re.findall(r'(?is)<a class="emisores__link" href="([^"]+)">(.*?)</a>', blk.group(2)):
        code = urllib.parse.parse_qs(urllib.parse.urlparse(href).query).get('participante', [''])[0]
        if code in seen:
            for o in out:
                if o['codigo'] == code and sector not in o['sectores']: o['sectores'].append(sector)
            continue
        seen.add(code)
        out.append({'codigo': code, 'nombre': html.unescape(name).strip(), 'sectores': [sector], 'url': BASE + html.unescape(href)})
print('participantes', len(out))
for o in out:
    ls = text(fetch(o['url']))
    d = {}
    for l in ls:
        m = re.match(r'(Información al|Oficina Central|Dirección|Website)\s*:\s*(.*)', l)
        if m and m.group(1) not in d: d[m.group(1)] = m.group(2)
    try:
        i = next(k for k, l in enumerate(ls) if l.startswith('Website') or l.startswith('Fax'))
        d['objeto'] = ' '.join(ls[i + 1:i + 3])[:500]
    except StopIteration:
        pass
    o['detalle'] = d
    time.sleep(1)
json.dump(out, open(sys.argv[2], 'w', encoding='utf-8'), ensure_ascii=False)
print('done', len(out))
