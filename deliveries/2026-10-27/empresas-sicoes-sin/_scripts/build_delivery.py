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


import re, unicodedata
# Formas legales reales. Una «Empresa…» sin ninguna (o con UNIPERSONAL en el nombre) se trata como unipersonal: sin domicilio.
FORMA_LEGAL = re.compile(
    r'\bS ?R ?L\b|\bS ?A\b|\bLTDA\b|\bLIMITADA\b|\bS ?A ?C\b|\bS ?C ?S\b|\bS ?C ?A\b|COOPERATIVA|ASOCIACION|FUNDACION|'
    r'SOCIEDAD ACCIDENTAL|SOCIEDAD ANONIMA|RESPONSABILIDAD LIMITADA')
EMAIL = re.compile(r'[\w.+-]+@[\w-]+\.[\w.-]+')
# 7 o más dígitos, admitiendo espacios, guiones, puntos y paréntesis entre ellos (y un + o ( inicial)
TEL_SPAN = re.compile(r'(?:\+\s*|\(\s*)?\d(?:[\s\-.()]*\d){6,}\)?')
RESPALDO = re.compile(r'(?<!\d)(?:\+?591[\s-]?)?[2-7](?:[\s.\-]?\d){6,7}(?!\d)')
ROTULO = re.compile(r'(?i)\b(?:telf?s?|tel[eé]fonos?|cel(?:ular)?|fax|whatsapp|wpp|fono|tlf|cel)\b\.?\s*:?\s*(?=$|[,;/\-|])')
TEL_STATS = collections.Counter()


def _sin_tildes(s):
    return ''.join(ch for ch in unicodedata.normalize('NFKD', s) if not unicodedata.combining(ch))


def forma_legal(nombre):
    if not nombre:
        return False
    u = _sin_tildes(unicodedata.normalize('NFKC', nombre)).upper().replace('.', ' ').replace(',', ' ')
    u = ' '.join(u.split())
    if 'UNIPERSONAL' in u:
        return False
    return bool(FORMA_LEGAL.search(u))


def es_unipersonal(tipo, razon):
    return bool(tipo and tipo.startswith('Empresa') and not forma_legal(razon))


def scrub(s, campo='texto'):
    """Normaliza (NFKC) y quita correos y teléfonos, también los escritos con separadores."""
    if not s:
        return s
    s = unicodedata.normalize('NFKC', s)
    for m in EMAIL.finditer(s):
        TEL_STATS['correos:' + campo] += 1
    s = EMAIL.sub(' ', s)

    def quitar(m):
        txt = m.group(0)
        if sum(ch.isdigit() for ch in txt) < 7:
            return txt
        TEL_STATS['telefonos:' + campo] += 1
        if re.search(r'[\s\-.()]', txt.strip('+( )')):
            TEL_STATS['telefonos_con_separadores:' + campo] += 1
        return ' '
    s = TEL_SPAN.sub(quitar, s)
    s = RESPALDO.sub(lambda m: (TEL_STATS.update(['telefonos_respaldo:' + campo]) or ' '), s)
    s = ROTULO.sub(' ', s)
    s = ' '.join(s.split()).strip(' ,;-/|:')
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
    with gzip.open(fn, 'wt', encoding='utf-8', newline=chr(10)) as f:
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
                razon = clean(r.get('razonSocial'))
                unip = es_unipersonal(tipo, razon)
                sucs = d.get('sucursales') if isinstance(d.get('sucursales'), list) else []
                razon = scrub(razon, 'razon_social')
                raw.update({'nombre_comercial': scrub(clean(d.get('nombreComercial')), 'nombre_comercial'),
                            'provincia_o_ciudad': scrub(clean(d.get('provincia')), 'provincia_o_ciudad'),
                            'catalogo_unspsc': [[clean(x[0]), clean(x[1])] for x in cat if isinstance(x, list) and len(x) > 1],
                            'n_sucursales': len(sucs) if k in det else None})
                if unip:
                    # unipersonal: sin domicilio, ni de la casa matriz ni de sucursales
                    raw['unipersonal_presunta'] = True
                    raw['sucursales'] = [{'pais': clean(s[0]), 'ciudad': scrub(clean(s[1]), 'sucursal'), 'nro': scrub(clean(s[2]), 'sucursal')}
                                         for s in sucs if isinstance(s, list) and len(s) >= 3][:50]
                    direccion = None
                    if k in det and clean(d.get('direccion')):
                        c['direccion_omitida_unipersonal'] += 1
                else:
                    # sucursal = [país, ciudad, nro, dirección, responsable, teléfono, fax, casilla]:
                    # se guardan solo país, ciudad, número y dirección (sin responsable ni contactos)
                    raw['sucursales'] = [{'pais': clean(s[0]), 'ciudad': scrub(clean(s[1]), 'sucursal'), 'nro': scrub(clean(s[2]), 'sucursal'),
                                          'direccion': scrub(clean(s[3]), 'sucursal')}
                                         for s in sucs if isinstance(s, list) and len(s) >= 4][:50]
                    direccion = scrub(clean(d.get('direccion')), 'direccion')
                out = {'source': 'sicoes_rupe', 'nit': nit,
                       'razon_social': razon, 'tipo': tipo, 'estado': clean(r.get('estado')),
                       'actividad': actividad, 'departamento': clean(r.get('departamento')) or clean(d.get('departamento')),
                       'direccion': direccion, 'raw': raw}
                c['unipersonal_presunta'] += bool(unip)
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
    c.update(TEL_STATS)
    stats['sicoes_rupe'] = dict(c)
    return fn


# ---------------- SIN ----------------
def build_sin():
    src = os.path.join(DL, 'sin', 'sin_listas.ndjson')
    os.makedirs(os.path.join(OUT, 'sin'), exist_ok=True)
    fn = os.path.join(OUT, 'sin', 'sin_listas_publicadas.ndjson.gz')
    c = collections.Counter()
    nits = set()
    with gzip.open(fn, 'wt', encoding='utf-8', newline=chr(10)) as f:
        for line in open(src, encoding='utf-8'):
            r = json.loads(line)
            if r.get('razon_social') and not forma_legal(r['razon_social']):
                # sin forma societaria puede ser una persona natural: solo NIT y lista
                r['razon_social'] = None
                r['raw']['razon_social_omitida'] = 'sin forma societaria (posible persona natural)'
                c['razon_social_omitida'] += 1
            elif r.get('razon_social'):
                r['razon_social'] = scrub(r['razon_social'], 'sin_razon_social')
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
inv_src = os.path.join(DL, 'sin', 'scan.jsonl')
if os.path.exists(inv_src):
    with open(inv_src, encoding='utf-8') as a, open(os.path.join(OUT, 'sin', 'inventario_pdfs_sin.jsonl'), 'w', encoding='utf-8', newline='\n') as b:
        for line in a:
            b.write(line.rstrip('\r\n') + '\n')
man = {'generated_at': NOW, 'branch': 'datos/2026-10-27-empresas-sicoes-sin', 'files': [], 'stats': stats}
for fn in sorted(glob.glob(os.path.join(OUT, '**', '*'), recursive=True)):
    rel = os.path.relpath(fn, OUT).replace(os.sep, '/')
    if os.path.isdir(fn) or rel == 'manifest.json' or rel.startswith('_scripts') or rel == 'README.md':
        continue
    h = hashlib.sha256(open(fn, 'rb').read()).hexdigest()
    ent = {'path': rel, 'sha256': h, 'bytes': os.path.getsize(fn)}
    if fn.endswith('.ndjson.gz'):
        with gzip.open(fn, 'rt', encoding='utf-8') as g:
            ent['rows'] = sum(1 for _ in g)
    elif fn.endswith('.jsonl'):
        ent['rows'] = sum(1 for _ in open(fn, encoding='utf-8'))
    man['files'].append(ent)
json.dump(man, open(os.path.join(OUT, 'manifest.json'), 'w', encoding='utf-8', newline='\n'), ensure_ascii=False, indent=1)
print(json.dumps(stats, ensure_ascii=False, indent=1))
