"""Ficha pública del proveedor RUPE (getDatosRupe) para los proveedores ya listados.

Uso: python -P sic_rupe_detail.py RUPE_DIR WORKERS [LIMIT]
Lee RUPE_DIR/pages_*.jsonl y list_*.jsonl, escribe RUPE_DIR/detail.jsonl (reanudable).
Descarta del detalle teléfono, fax, casilla y correo (no se guardan).
"""
import sys, os, glob, json, time, threading
from concurrent.futures import ThreadPoolExecutor
sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
from sic_rupe_list import client

D = sys.argv[1]
W = int(sys.argv[2])
LIMIT = int(sys.argv[3]) if len(sys.argv) > 3 else None
NATURAL = ('Persona Natural',)
rows = {}
for fn in glob.glob(os.path.join(D, 'pages_*.jsonl')):
    for line in open(fn, encoding='utf-8'):
        try:
            for r in json.loads(line)['rows']:
                rows[r['rupe']] = r
        except Exception:
            pass
for fn in [x for x in glob.glob(os.path.join(D, 'list_*.jsonl')) if not x.endswith('list_log.jsonl')]:
    for line in open(fn, encoding='utf-8'):
        r = json.loads(line)
        rows[r['rupe']] = r
out = os.path.join(D, 'detail.jsonl')
done = set()
if os.path.exists(out):
    for line in open(out, encoding='utf-8'):
        try:
            done.add(json.loads(line)['rupe'])
        except Exception:
            pass
todo = [k for k, r in rows.items() if k not in done and not any(n in (r.get('tipoProveedor') or '') for n in NATURAL)]
# primero los que tienen NIT
def prio(k):
    t = rows[k].get('tipoProveedor') or ''
    return (0 if 'Tributaria' in (rows[k].get('tipoDocumento') or '') else 1,
            2 if 'Accidental' in t else (1 if 'Extranjera' in t else 0))


todo.sort(key=prio)
if os.environ.get('RUPE_TODO'):
    # reanudación desde la entrega: un código RUPE por línea (sicoes_rupe/fichas_pendientes.txt)
    todo = [x.strip() for x in open(os.environ['RUPE_TODO'], encoding='utf-8') if x.strip() and x.strip() not in done]
if LIMIT:
    todo = todo[:LIMIT]
print('listados', len(rows), 'hechos', len(done), 'por hacer', len(todo), flush=True)
lock = threading.Lock()
cnt = [0]
DROP = {'telefono', 'fax', 'casillaCorreo', 'correo', 'email'}


def one(k):
    j = client().detail(k)
    rec = {'rupe': k, 'ts': time.strftime('%Y-%m-%dT%H:%M:%S')}
    if j and j.get('ESTADO') == 0:
        dd = {a: b for a, b in (j.get('data') or {}).items() if a not in DROP}
        if isinstance(dd.get('sucursales'), list):
            # sucursal = [país, ciudad, nro, dirección, responsable, teléfono, fax, casilla]: se guardan los 4 primeros
            dd['sucursales'] = [{a: b for a, b in s.items() if a not in DROP} if isinstance(s, dict) else
                                (s[:4] if isinstance(s, list) else None) for s in dd['sucursales']]
        rec['data'] = dd
    else:
        rec['error'] = (j or {}).get('ERROR') if isinstance(j, dict) else 'sin respuesta'
    with lock:
        with open(out, 'a', encoding='utf-8') as f:
            f.write(json.dumps(rec, ensure_ascii=False) + '\n')
        cnt[0] += 1
        if cnt[0] % 500 == 0:
            print(time.strftime('%H:%M:%S'), cnt[0], '/', len(todo), flush=True)


with ThreadPoolExecutor(W) as ex:
    list(ex.map(one, todo))
print('DONE', flush=True)
