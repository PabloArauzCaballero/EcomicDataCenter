"""Tras merge_pendientes.py: recalcula pendientes, conteos, manifest.json (sha256) y los números del README.
Uso: python -P finalize_merge.py DELIVERY_DIR FECHA_HORA"""
import sys, os, json, gzip, hashlib, re
D, STAMP = sys.argv[1:3]
fn = os.path.join(D, 'sicoes_rupe', 'sicoes_rupe_proveedores.ndjson.gz')
c = dict(filas=0, con_nit=0, con_direccion=0, con_nit_y_direccion=0, con_actividad=0, detalles=0, unipersonal_presunta=0)
pend = []
with gzip.open(fn, 'rt', encoding='utf-8') as f:
    for line in f:
        r = json.loads(line)
        c['filas'] += 1
        c['con_nit'] += bool(r['nit'])
        c['con_direccion'] += bool(r.get('direccion'))
        c['con_nit_y_direccion'] += bool(r['nit'] and r.get('direccion'))
        c['con_actividad'] += bool(r['actividad'])
        c['detalles'] += bool(r['raw'].get('detalle_consultado'))
        c['unipersonal_presunta'] += bool(r['raw'].get('unipersonal_presunta'))
        t = r['tipo'] or ''
        if 'Persona Natural' not in t and not r['raw'].get('detalle_consultado'):
            pend.append(((0 if r['nit'] else 1), (2 if 'Accidental' in t else (1 if 'Extranjera' in t else 0)), r['raw']['rupe']))
pend.sort()
open(os.path.join(D, 'sicoes_rupe', 'fichas_pendientes.txt'), 'w', newline='\n').write(''.join(p[2] + '\n' for p in pend))
mp = os.path.join(D, 'manifest.json')
m = json.load(open(mp, encoding='utf-8'))
m['stats']['sicoes_rupe'].update(c)
for e in m['files']:
    p = os.path.join(D, e['path'])
    e['sha256'] = hashlib.sha256(open(p, 'rb').read()).hexdigest()
    e['bytes'] = os.path.getsize(p)
    if e['path'].endswith('.ndjson.gz'):
        with gzip.open(p, 'rt', encoding='utf-8') as g:
            e['rows'] = sum(1 for _ in g)
json.dump(m, open(mp, 'w', encoding='utf-8', newline='\n'), ensure_ascii=False, indent=1)
fmt = lambda x: format(x, ',').replace(',', '.')
pc = lambda a, b: '%s (%s %%)' % (fmt(a), ('%.1f' % (100.0 * a / b)).replace('.', ','))
rp = os.path.join(D, 'README.md')
t = open(rp, encoding='utf-8').read()
row = '| `sicoes_rupe_proveedores.ndjson.gz` | %s | %s | %s | %s |' % (fmt(c['filas']), pc(c['con_nit'], c['filas']), pc(c['con_direccion'], c['filas']), pc(c['con_nit_y_direccion'], c['filas']))
t = re.sub(r'\| `sicoes_rupe_proveedores.ndjson.gz` \|[^\n]*', lambda _: row, t, count=1)
t = re.sub(r'\*\*Fichas consultadas \(`getDatosRupe`\): [\d.]+ de [\d.]+ filas\.\*\*',
           '**Fichas consultadas (`getDatosRupe`): %s de %s filas.**' % (fmt(c['detalles']), fmt(c['filas'])), t)
open(rp, 'w', encoding='utf-8', newline='\n').write(t)
print(c, 'pendientes', len(pend))
