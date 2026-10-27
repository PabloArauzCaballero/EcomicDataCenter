"""Lista la Guía de Proveedores del RUPE (SICOES) por particiones tipo x departamento.

Uso: python -P sic_rupe_list.py OUT_DIR TIPOS(coma) [WORKERS]
Escribe OUT_DIR/list_<tipo>_<depto>.jsonl con una fila por proveedor (sin duplicados)
y OUT_DIR/list_log.jsonl con la cuenta declarada vs la cuenta única obtenida.
"""
import re, sys, os, json, time, threading, urllib.parse
from concurrent.futures import ThreadPoolExecutor
import requests

BASE = 'https://www.sicoes.gob.bo'
H = {'X-Requested-With': 'XMLHttpRequest', 'Referer': BASE + '/portal/rupe/guiaProveedores.php'}
COLS = ['opciones', 'rupe', 'tipoDocumento', 'numeroDocumento', 'razonSocial', 'tipoProveedor', 'paisOrigen', 'pais',
        'departamento', 'estado']


class Client:
    def __init__(self):
        self.s = None
        self.reset()

    def reset(self):
        self.s = requests.Session()
        self.s.headers['User-Agent'] = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 Chrome/130 Safari/537.36 (DatosBolivia research)'
        r = self.s.get(BASE + '/portal/index.php', timeout=60)
        tok = re.search(r'id="token"[^>]*value="([^"]+)"', r.text).group(1)
        r = self.s.get(BASE + '/portal/rupe/guiaProveedores.php?token=' + tok, timeout=60)
        self.tok = re.search(r'id="token"[^>]*value="([^"]+)"', r.text).group(1)

    def page(self, draw, **kw):
        data = {'token': self.tok, 'razonSocial': '', 'selPais': '', 'numeroDocumento': '', 'selTipo': '',
                'formacion': '', 'selPaisOrigen': '', 'selUbiGeo': '', 'operacion': 'guiaProveedores',
                'autocorrector': '', 'nroRegistros': 10, 'draw': draw, 'start': 0, 'length': 10, 'captcha': ''}
        data.update(kw)
        for attempt in range(6):
            try:
                r = self.s.post(BASE + '/portal/rupe/operacion.php', data=data, headers=H, timeout=120)
                j = r.json()
                rows = []
                for x in j.get('data') or []:
                    v = list(x.values())
                    rows.append(dict(zip(COLS, v)))
                return j.get('recordsTotal') or 0, rows
            except Exception as e:  # noqa
                time.sleep(3 * (attempt + 1))
                try:
                    self.reset()
                except Exception:
                    pass
        raise RuntimeError('page failed %s %s' % (draw, kw))

    def detail(self, rupe):
        for attempt in range(6):
            try:
                r = self.s.post(BASE + '/portal/rupe/operacion.php',
                                data={'operacion': 'getDatosRupe', 'rupe': rupe, 'token': self.tok}, headers=H,
                                timeout=60)
                return r.json()
            except Exception:
                time.sleep(3 * (attempt + 1))
                try:
                    self.reset()
                except Exception:
                    pass
        return None


local = threading.local()


def client():
    if not hasattr(local, 'c'):
        local.c = Client()
    return local.c


def do_partition(out, tipo, depto, extra=None):
    kw = {'selTipo': tipo, 'selUbiGeo': depto}
    if extra:
        kw.update(extra)
    tag = '%s_%s%s' % (tipo, depto or 'X', ('_' + '_'.join('%s%s' % kv for kv in extra.items())) if extra else '')
    fn = os.path.join(out, 'list_%s.jsonl' % tag)
    if os.path.exists(fn + '.done'):
        return
    c = client()
    total, rows = c.page(1, **kw)
    seen = {}
    for r in rows:
        seen[r['rupe']] = r
    pages = (total + 9) // 10
    passes = 0
    while True:
        passes += 1
        for p in range(2, pages + 1):
            _, rows = c.page(p, **kw)
            for r in rows:
                seen[r['rupe']] = r
        if len(seen) >= total or passes >= 3:
            break
    with open(fn, 'w', encoding='utf-8') as f:
        for r in seen.values():
            f.write(json.dumps(r, ensure_ascii=False) + '\n')
    with open(os.path.join(out, 'list_log.jsonl'), 'a', encoding='utf-8') as f:
        f.write(json.dumps({'tipo': tipo, 'depto': depto, 'extra': extra, 'declarado': total, 'unicos': len(seen),
                            'pasadas': passes, 'ts': time.strftime('%Y-%m-%dT%H:%M:%S')}) + '\n')
    open(fn + '.done', 'w').close()
    print(tag, total, len(seen), passes, flush=True)


def run_paged(out, tipos, workers):
    parts = []
    for t in tipos:
        ds = [''] if t in ('10', '11') else [str(i) for i in range(1, 10)]
        for d in ds:
            parts.append((t, d))
    def head(pd):
        t, d = pd
        fn = os.path.join(out, 'pages_%s_%s.jsonl' % (t, d or 'X'))
        total, rows = client().page(1, selTipo=t, selUbiGeo=d)
        return (t, d, total)
    with ThreadPoolExecutor(workers) as ex:
        heads = list(ex.map(head, parts))
    json.dump(heads, open(os.path.join(out, 'heads.json'), 'w'))
    print('heads', heads, flush=True)
    jobs = []
    for t, d, total in heads:
        fn = os.path.join(out, 'pages_%s_%s.jsonl' % (t, d or 'X'))
        done = set()
        if os.path.exists(fn):
            for line in open(fn, encoding='utf-8'):
                try:
                    done.add(json.loads(line)['p'])
                except Exception:
                    pass
        for p in range(1, (total + 9) // 10 + 1):
            if p not in done:
                jobs.append((t, d, p))
    print('jobs', len(jobs), flush=True)
    lock = threading.Lock()
    cnt = [0]
    def one(j):
        t, d, p = j
        _, rows = client().page(p, selTipo=t, selUbiGeo=d)
        fn = os.path.join(out, 'pages_%s_%s.jsonl' % (t, d or 'X'))
        with lock:
            with open(fn, 'a', encoding='utf-8') as f:
                f.write(json.dumps({'p': p, 'rows': rows}, ensure_ascii=False) + '\n')
            cnt[0] += 1
            if cnt[0] % 200 == 0:
                print(time.strftime('%H:%M:%S'), cnt[0], '/', len(jobs), flush=True)
    with ThreadPoolExecutor(workers) as ex:
        list(ex.map(one, jobs))
    print('DONE', flush=True)


if __name__ == '__main__':
    out = sys.argv[1]
    os.makedirs(out, exist_ok=True)
    tipos = sys.argv[2].split(',')
    workers = int(sys.argv[3]) if len(sys.argv) > 3 else 4
    run_paged(out, tipos, workers)
