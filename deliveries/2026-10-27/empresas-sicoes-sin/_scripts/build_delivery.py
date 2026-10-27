"""Arma la entrega: NDJSON.gz por fuente + manifest.json con sha256 y conteos.

Uso: python -P build_delivery.py WORK_DL DELIVERY_DIR
"""
import sys, os, glob, json, gzip, hashlib, datetime, collections

DL, OUT = sys.argv[1], sys.argv[2]
NOW = datetime.datetime.now(datetime.timezone.utc).strftime('%Y-%m-%dT%H:%M:%SZ')
TODAY = NOW[:10]
FIELDS = ['source', 'nit', 'matricula', 'razon_social', 'tipo', 'estado', 'actividad', 'departamento', 'municipio',
          'direccion', 'adjudicado_por_anio', 'source_url', 'source_date', 'retrieved_at', 'raw']
stats = {}


def ordered(r):
    return {k: r.get(k) for k in FIELDS}


def clean(s):
    if s is None:
        return None
    s = ' '.join(str(s).split())
    return s or None


# ---------------- SICOES / RUPE ----------------
def build_rupe():
    D = os.path.join(DL, 'rupe')
    rows = {}
    pfiles = glob.glob(os.path.join(D, 'pages_*.jsonl'))
    for fn in pfiles:
        for line in open(fn, encoding='utf-8'):
            try:
                rec = json.loads(line)
            except Exception:
                continue
            for r in rec['rows']:
                rows[r['rupe']] = r
    for fn in [x for x in glob.glob(os.path.join(D, 'list_*.jsonl')) if not x.endswith('list_log.jsonl')]:
        for line in open(fn, encoding='utf-8'):
            r = json.loads(line)
            rows[r['rupe']] = r
    det = {}
    dfn = os.path.join(D, 'detail.jsonl')
    if os.path.exists(dfn):
        for line in open(dfn, encoding='utf-8'):
            try:
                x = json.loads(line)
            except Exception:
                continue
            if 'data' in x:
                det[x['rupe']] = x
    heads = json.load(open(os.path.join(D, 'heads.json'))) if os.path.exists(os.path.join(D, 'heads.json')) else []
    declared = sum(h[2] for h in heads)
    os.makedirs(os.path.join(OUT, 'sicoes_rupe'), exist_ok=True)
    fn = os.path.join(OUT, 'sicoes_rupe', 'sicoes_rupe_proveedores.ndjson.gz')
    c = collections.Counter()
    with gzip.open(fn, 'wt', encoding='utf-8') as f:
        for k in sorted(rows, key=lambda x: int(x) if x.isdigit() else 0):
            r = rows[k]
            tipo = clean(r.get('tipoProveedor'))
            natural = 'Persona Natural' in (tipo or '')
            es_nit = 'Tributaria' in (r.get('tipoDocumento') or '')
            nit = clean(r.get('numeroDocumento')) if es_nit else None
            if natural and not nit:
                c['natural_sin_nit_excluido'] += 1
                continue
            d = (det.get(k) or {}).get('data') or {}
            cat = d.get('catalogo') or []
            actividad = '; '.join(clean(x[1]) for x in cat[:15] if isinstance(x, list) and len(x) > 1 and clean(x[1])) or None
            raw = {'rupe': k, 'tipo_documento': clean(r.get('tipoDocumento')), 'pais_origen': clean(r.get('paisOrigen')),
                   'pais': clean(r.get('pais')), 'detalle_consultado': k in det}
            if natural:
                out = {'source': 'sicoes_rupe', 'nit': nit, 'tipo': tipo, 'estado': clean(r.get('estado')),
                       'actividad': actividad, 'departamento': clean(r.get('departamento')),
                       'raw': {'rupe': k, 'tipo_documento': raw['tipo_documento'], 'nota': 'persona natural: solo NIT y actividad'}}
            else:
                raw.update({'nombre_comercial': clean(d.get('nombreComercial')), 'provincia_o_ciudad': clean(d.get('provincia')),
                            'catalogo_unspsc': [[clean(x[0]), clean(x[1])] for x in cat if isinstance(x, list) and len(x) > 1],
                            'n_sucursales': len(d.get('sucursales') or []) if isinstance(d.get('sucursales'), list) else None,
                            'sucursales': [{a: clean(b) for a, b in s.items()} for s in (d.get('sucursales') or []) if isinstance(s, dict)][:50]})
                out = {'source': 'sicoes_rupe', 'nit': nit,
                       'razon_social': clean(r.get('razonSocial')), 'tipo': tipo, 'estado': clean(r.get('estado')),
                       'actividad': actividad, 'departamento': clean(r.get('departamento')) or clean(d.get('departamento')),
                       'direccion': clean(d.get('direccion')), 'raw': raw}
                if not nit:
                    raw['numero_documento'] = clean(r.get('numeroDocumento'))
            out.update({'matricula': None, 'municipio': None, 'adjudicado_por_anio': None,
                        'source_url': 'https://www.sicoes.gob.bo/portal/rupe/guiaProveedores.php',
                        'source_date': TODAY, 'retrieved_at': (det.get(k) or {}).get('ts', NOW)})
            f.write(json.dumps(ordered(out), ensure_ascii=False) + '\n')
            c['filas'] += 1
            c['con_nit'] += bool(nit)
            c['con_direccion'] += bool(out.get('direccion'))
            c['con_nit_y_direccion'] += bool(nit and out.get('direccion'))
            c['con_actividad'] += bool(actividad)
            c['tipo:' + (tipo or '?')] += 1
    c['listados_unicos'] = len(rows)
    c['declarados_por_el_portal_en_tipos_listados'] = declared
    c['detalles'] = len(det)
    stats['sicoes_rupe'] = dict(c)
    return fn


# ---------------- SIN ----------------
def build_sin():
    src = os.path.join(DL, 'sin', 'sin_listas.ndjson')
    os.makedirs(os.path.join(OUT, 'sin'), exist_ok=True)
    fn = os.path.join(OUT, 'sin', 'sin_listas_publicadas.ndjson.gz')
    c = collections.Counter()
    nits = set()
    with gzip.open(fn, 'wt', encoding='utf-8') as f:
        for line in open(src, encoding='utf-8'):
            r = json.loads(line)
            f.write(json.dumps(ordered(r), ensure_ascii=False) + '\n')
            c['filas'] += 1
            c['lista:' + r['raw']['lista']] += 1
            c['con_departamento'] += bool(r.get('departamento'))
            c['con_razon_social'] += bool(r.get('razon_social'))
            nits.add(r['nit'])
    c['nit_unicos'] = len(nits)
    stats['sin'] = dict(c)
    return fn


files = [build_rupe(), build_sin()]
man = {'generated_at': NOW, 'branch': 'datos/2026-10-27-empresas-sicoes-sin', 'files': [], 'stats': stats}
for fn in files + sorted(glob.glob(os.path.join(OUT, '**', '*.json'), recursive=True)):
    if fn.endswith('manifest.json'):
        continue
for fn in sorted(glob.glob(os.path.join(OUT, '**', '*'), recursive=True)):
    if os.path.isdir(fn) or fn.endswith('manifest.json'):
        continue
    h = hashlib.sha256(open(fn, 'rb').read()).hexdigest()
    ent = {'path': os.path.relpath(fn, OUT).replace('\\', '/'), 'sha256': h, 'bytes': os.path.getsize(fn)}
    if fn.endswith('.ndjson.gz'):
        with gzip.open(fn, 'rt', encoding='utf-8') as g:
            ent['rows'] = sum(1 for _ in g)
    man['files'].append(ent)
json.dump(man, open(os.path.join(OUT, 'manifest.json'), 'w', encoding='utf-8'), ensure_ascii=False, indent=1)
print(json.dumps(stats, ensure_ascii=False, indent=1))
