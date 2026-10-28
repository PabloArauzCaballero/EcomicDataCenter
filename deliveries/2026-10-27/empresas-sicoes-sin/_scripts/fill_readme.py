"""Rellena el README desde una plantilla con los conteos de manifest.json.
Uso: python -P fill_readme.py DELIVERY_DIR PLANTILLA cobertura.md adj.md "texto de reanudación" """
import sys, os, json
D, TPL, COB, ADJ, REAN = sys.argv[1:6]
m = json.load(open(os.path.join(D, 'manifest.json'), encoding='utf-8'))
s = m['stats']
r, n = s['sicoes_rupe'], s['sin']


def fmt(x):
    return format(x, ',').replace(',', '.')


def pct(a, b):
    return ('%s (%.1f %%)' % (fmt(a), 100.0 * a / b)).replace('.0 %', ',0 %') if b else '0'


def pct2(a, b):
    v = ('%.1f' % (100.0 * a / b)).replace('.', ',') if b else '0'
    return '%s (%s %%)' % (fmt(a), v)


cob = open(COB, encoding='utf-8').read().strip()
cob = cob.replace('__DETALLES__', fmt(r.get('detalles', 0)) + ' de ' + fmt(r['filas']) + ' filas').replace('__REANUDACION__', REAN)
rep = {
    '__RUPE_FILAS__': fmt(r['filas']), '__RUPE_NIT__': pct2(r['con_nit'], r['filas']),
    '__RUPE_DIR__': pct2(r['con_direccion'], r['filas']), '__RUPE_NITDIR__': pct2(r['con_nit_y_direccion'], r['filas']),
    '__SIN_FILAS__': fmt(n['filas']), '__SIN_NITS__': fmt(n['nit_unicos']),
    '__CAT__': fmt(n.get('lista:categorizacion', 0)), '__FE__': fmt(n.get('lista:facturacion_modalidad', 0)),
    '__OBS__': fmt(n.get('lista:nit_observados', 0)), '__JUR__': fmt(n.get('lista:jurisdiccion', 0)),
    '__POR__': fmt(n.get('lista:portal', 0)),
    '__RUPE_COBERTURA__': cob,
    '__ADJ__': open(ADJ, encoding='utf-8').read().strip(),
}
t = open(TPL, encoding='utf-8').read()
for k, v in rep.items():
    t = t.replace(k, v)
open(os.path.join(D, 'README.md'), 'w', encoding='utf-8', newline='\n').write(t)
left = [w for w in t.split() if w.startswith('__') and w.endswith('__')]
print('pendientes', left, 'detalles', r.get('detalles'), 'con_direccion', r['con_direccion'])
