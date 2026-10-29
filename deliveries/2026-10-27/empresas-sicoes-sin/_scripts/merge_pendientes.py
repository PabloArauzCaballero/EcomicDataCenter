"""Fusiona fichas nuevas (detail.jsonl) con el archivo publicado, por código RUPE, con las MISMAS reglas de build_delivery.py.

Uso: python -P merge_pendientes.py DETAIL_JSONL PUBLICADO.ndjson.gz SALIDA.ndjson.gz
Solo reconstruye las filas con raw.detalle_consultado = false cuya ficha llegó con datos; el resto queda igual.
"""
import sys, os, re, json, gzip, collections, datetime, unicodedata
HERE = os.path.dirname(os.path.abspath(__file__))
src = open(os.path.join(HERE, 'build_delivery.py'), encoding='utf-8').read()
# reutiliza las reglas (clean, forma_legal, es_unipersonal, scrub, ordered) tal cual, sin ejecutar el build
head = src[src.index('FIELDS = ['):src.index('# ---------------- SICOES / RUPE')]
NOW = datetime.datetime.now(datetime.timezone.utc).strftime('%Y-%m-%dT%H:%M:%SZ')
g = {'collections': collections, 'NOW': NOW, 'TODAY': NOW[:10], 'os': os, 'json': json}
exec('import collections\nstats = {}\n' + head, g)
clean, es_unipersonal, scrub, ordered = g['clean'], g['es_unipersonal'], g['scrub'], g['ordered']

DET, PUB, OUT = sys.argv[1:4]
COMP = sys.argv[4] if len(sys.argv) > 4 else None  # opcional: solo las filas nuevas, mismo esquema
comp = gzip.open(COMP, 'wt', encoding='utf-8', newline='\n') if COMP else None
det = {}
for line in open(DET, encoding='utf-8'):
    try:
        x = json.loads(line)
    except Exception:
        continue
    if 'data' in x:
        det[x['rupe']] = x
c = collections.Counter()
with gzip.open(PUB, 'rt', encoding='utf-8') as a, gzip.open(OUT, 'wt', encoding='utf-8', newline='\n') as f:
    for line in a:
        r = json.loads(line)
        k = r['raw']['rupe']
        if r['raw'].get('detalle_consultado') or k not in det or 'Persona Natural' in (r['tipo'] or ''):
            f.write(line)
            continue
        d = det[k]['data']
        cat = d.get('catalogo') or []
        r['actividad'] = '; '.join(clean(x[1]) for x in cat[:15] if isinstance(x, list) and len(x) > 1 and clean(x[1])) or None
        raw = {'rupe': k, 'tipo_documento': r['raw'].get('tipo_documento'), 'pais_origen': r['raw'].get('pais_origen'),
               'pais': r['raw'].get('pais'), 'detalle_consultado': True}
        sucs = d.get('sucursales') if isinstance(d.get('sucursales'), list) else []
        razon = r['razon_social']
        unip = es_unipersonal(r['tipo'], clean(razon))
        raw.update({'nombre_comercial': scrub(clean(d.get('nombreComercial')), 'nombre_comercial'),
                    'provincia_o_ciudad': scrub(clean(d.get('provincia')), 'provincia_o_ciudad'),
                    'catalogo_unspsc': [[clean(x[0]), clean(x[1])] for x in cat if isinstance(x, list) and len(x) > 1],
                    'n_sucursales': len(sucs)})
        if unip:
            raw['unipersonal_presunta'] = True
            raw['sucursales'] = [{'pais': clean(s[0]), 'ciudad': scrub(clean(s[1]), 'sucursal'), 'nro': scrub(clean(s[2]), 'sucursal')}
                                 for s in sucs if isinstance(s, list) and len(s) >= 3][:50]
            r['direccion'] = None
            c['unipersonal'] += 1
        else:
            raw['sucursales'] = [{'pais': clean(s[0]), 'ciudad': scrub(clean(s[1]), 'sucursal'), 'nro': scrub(clean(s[2]), 'sucursal'),
                                  'direccion': scrub(clean(s[3]), 'sucursal')}
                                 for s in sucs if isinstance(s, list) and len(s) >= 4][:50]
            r['direccion'] = scrub(clean(d.get('direccion')), 'direccion')
        if not r['nit']:
            raw['numero_documento'] = r['raw'].get('numero_documento')
        r['raw'] = raw
        r['departamento'] = r['departamento'] or clean(d.get('departamento'))
        r['retrieved_at'] = det[k]['ts']
        r['source_date'] = NOW[:10]
        c['fusionadas'] += 1
        c['con_direccion_nueva'] += bool(r['direccion'])
        out = json.dumps(ordered(r), ensure_ascii=False) + '\n'
        f.write(out)
        if comp:
            comp.write(out)
if comp:
    comp.close()
print(dict(c))
