"""Descarga PDFs del SIN (biblioteca de medios) con nombre de norma/anexo/lista y mide si traen listas de NIT.
Uso: python -P sin_scan_pdfs.py media.json OUTDIR scan.jsonl"""
import sys, os, re, json, hashlib
from concurrent.futures import ThreadPoolExecutor
import requests, pymupdf

media, outdir, scan = sys.argv[1:4]
os.makedirs(outdir, exist_ok=True)
rows = json.load(open(media, encoding='utf-8'))
pat = re.compile(r'rnd|anexo|lista|nit|graco|prico|retenc|agente|electr|contribuy|categor|padron|padr', re.I)
seen = set()
todo = []
for r in rows:
    if r['mime'] != 'application/pdf':
        continue
    if not pat.search(r['title'] + ' ' + r['url']):
        continue
    fn = os.path.basename(r['url'])
    if fn in seen:
        continue
    seen.add(fn)
    todo.append(r)
print('todo', len(todo), flush=True)
done = set()
if os.path.exists(scan):
    for line in open(scan, encoding='utf-8'):
        done.add(json.loads(line)['url'])
NIT = re.compile(r'(?<!\d)\d{7,13}(?!\d)')
KW = re.compile(r'PRICO|GRACO|categoriza|agente[s]? de retenci|facturaci[oó]n electr|electr[oó]nic[oa] en l[ií]nea|cancelad|inactiv|baja de oficio|depuraci', re.I)
s = requests.Session()
s.headers['User-Agent'] = 'Mozilla/5.0 (DatosBolivia research)'


def one(r):
    if r['url'] in done:
        return None
    fn = os.path.join(outdir, os.path.basename(r['url']))
    try:
        if not os.path.exists(fn):
            x = s.get(r['url'], timeout=120)
            if x.status_code != 200:
                return {'url': r['url'], 'error': x.status_code}
            open(fn, 'wb').write(x.content)
        d = pymupdf.open(fn)
        txt = ''.join(p.get_text() for p in d)
        nits = NIT.findall(txt)
        kws = sorted(set(m.group(0).lower() for m in KW.finditer(txt)))
        return {'url': r['url'], 'title': r['title'], 'date': r['date'], 'pages': len(d), 'nits': len(nits),
                'kw': kws, 'head': re.sub(r'\s+', ' ', txt[:300]), 'sha256': hashlib.sha256(open(fn, 'rb').read()).hexdigest()}
    except Exception as e:
        return {'url': r['url'], 'error': str(e)[:200]}


with ThreadPoolExecutor(int(os.environ.get("W", "1"))) as ex, open(scan, 'a', encoding='utf-8') as f:
    for i, res in enumerate(ex.map(one, todo)):
        if res:
            f.write(json.dumps(res, ensure_ascii=False) + '\n')
            f.flush()
        if i % 100 == 0:
            print(i, flush=True)
print('DONE')
