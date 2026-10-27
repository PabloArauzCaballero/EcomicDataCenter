"""Convierte las listas publicadas por el SIN (PDF) en filas por NIT.

Uso: python -P sin_parse.py PDF_DIR SCAN_JSONL OUT_NDJSON
"""
import sys, os, re, json, datetime, hashlib
import pymupdf
sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
from sin_fe_tokens import fe_rows, nit_letter_rows, numbered_nits

PDF_DIR, SCAN, OUT = sys.argv[1:4]
NOW = datetime.datetime.now(datetime.timezone.utc).strftime('%Y-%m-%dT%H:%M:%SZ')
scan = {}
for line in open(SCAN, encoding='utf-8'):
    r = json.loads(line)
    if 'error' not in r:
        scan[os.path.basename(r['url'])] = r

NITW = re.compile(r'^\d{6,13}$')
BOILER = re.compile(r'www\.|L[IÍ]NEA GRATUITA|^RND|^R-\d|Contribuimos|^P[aá]g|^NIT$|^N[º°]|^MOD|^FECHA|ABREVIATURA|DISTRIBUCI|^\d+$|Vivir Bien|DE (19|20)\d\d|Art[ií]culo|podr[aá]n|aplicaci|presente|dispuest|Resoluci', re.I)
HEADER = re.compile(r'GRACO|PRICO|RESTO|DISTRITAL|GERENCIA|AGENCIA|SUBCATEGOR|ANEXO|LA PAZ|EL ALTO|COCHABAMBA|SANTA CRUZ|ORURO|POTOS|TARIJA|CHUQUISACA|SUCRE|BENI|PANDO|MONTERO|QUILLACOLLO', re.I)

DEPTOS = [
    (r'EL ALTO|LA PAZ|LPZ|CARANAVI|COPACABANA|GDEA|GDLP', 'La Paz'),
    (r'QUILLACOLLO|COCHABAMBA|CBBA|GDQ', 'Cochabamba'),
    (r'SANTA CRUZ|SCZ|MONTERO|CAMIRI|SAN IGNACIO|GDSC|GDM\b|PUERTO SUAREZ|PUERTO QUIJARRO', 'Santa Cruz'),
    (r'ORURO|GDO', 'Oruro'),
    (r'POTOS|UYUNI|TUPIZA|VILLAZ|GDP', 'Potosí'),
    (r'TARIJA|BERMEJO|VILLAMONTES|YACUIBA|GDT', 'Tarija'),
    (r'CHUQUISACA|SUCRE|MONTEAGUDO|GDCH', 'Chuquisaca'),
    (r'BENI|TRINIDAD|RIBERALTA|GUAYARAMER|GDB', 'Beni'),
    (r'PANDO|COBIJA|GDPA', 'Pando'),
]


def depto_de(txt):
    if not txt:
        return None
    u = txt.upper()
    if 'GDPA' in u or 'PANDO' in u or 'COBIJA' in u:
        return 'Pando'
    for pat, d in DEPTOS:
        if re.search(pat, u):
            return d
    return None


def categoria_de(txt):
    u = (txt or '').upper()
    if 'PRICO' in u or 'PRINCIPALES' in u:
        return 'PRICO'
    if 'GRACO' in u or 'GRANDES' in u:
        return 'GRACO'
    if 'RESTO' in u:
        return 'RESTO'
    return None


def lines_of(page):
    words = page.get_text('words')
    lines = {}
    for w in words:
        k = (w[5], w[6])
        if k not in lines:
            lines[k] = [w[0], w[1], w[2], w[3], []]
        L = lines[k]
        L[0] = min(L[0], w[0]); L[1] = min(L[1], w[1]); L[2] = max(L[2], w[2]); L[3] = max(L[3], w[3])
        L[4].append(w[4])
    return words, [(l[0], l[1], l[2], l[3], ' '.join(l[4])) for l in lines.values()]


def parse_positional(fn, meta):
    """NIT sueltos en columnas bajo encabezados (categorización PRICO/GRACO, jurisdicción)."""
    d = pymupdf.open(fn)
    out = []
    carry_hdr = None
    carry_cat = categoria_de(meta.get('cat_default'))
    for pno, page in enumerate(d):
        words, lines = lines_of(page)
        headers = [l for l in lines if HEADER.search(l[4]) and not BOILER.search(l[4]) and len(l[4]) < 120]
        # encabezados de categoría (cualquier columna)
        cats = [h for h in headers if categoria_de(h[4]) and re.search(r'ANEXO|CATEGOR|PRICO|GRACO|RESTO|SUBCATEG', h[4], re.I)]
        page_last_hdr = carry_hdr
        for w in words:
            tok = w[4]
            if not NITW.match(tok):
                continue
            # descarta numeración de fila (1..n) — ya excluida por longitud mínima 6
            xc = (w[0] + w[2]) / 2
            above = [h for h in headers if h[3] <= w[1] + 2]
            col = [h for h in above if h[0] - 60 <= xc <= h[2] + 60]
            hdr = max(col, key=lambda h: h[1])[4] if col else (max(above, key=lambda h: h[1])[4] if above else carry_hdr)
            cab = [h for h in cats if h[3] <= w[1] + 2]
            cat_hdr = max(cab, key=lambda h: h[1])[4] if cab else None
            cat = categoria_de(cat_hdr) or categoria_de(hdr) or carry_cat
            sub = None
            m = re.search(r'Subcategor[ií]a\s+([A-Z])', (cat_hdr or '') + ' ' + (hdr or ''), re.I)
            if m:
                sub = m.group(1)
            out.append({'nit': tok, 'gerencia': hdr, 'categoria': cat, 'subcategoria': sub, 'pagina': pno + 1})
        if headers:
            last = max(headers, key=lambda h: (h[1], h[0]))
            carry_hdr = last[4]
            lc = [h for h in cats]
            if lc:
                carry_cat = categoria_de(max(lc, key=lambda h: h[1])[4]) or carry_cat
    return out


def stream_text(fn):
    d = pymupdf.open(fn)
    return [re.sub(r'\s+', ' ', p.get_text()) for p in d]


FE_NEW = re.compile(r'(?<!\d)(\d{6,13}) ((?:GRACO|GD|GERENCIA|DISTRITAL|AT|AGENCIA)[A-Z .]{0,25}?(?: [IVX]{1,3})?) (EL o CL|CL o PWL|CL o PW|PWL|PW|EL|CL)(?![A-Za-z])')
FE_2018 = re.compile(r'(?<!\d)(\d{6,13}) (\d{1,2}/\d{1,2}/\d{4}) (G[IVX]+) (PW|M|P|C|E)(?![A-Za-z])')
FE_2019 = re.compile(r'(?<!\d)(\d{6,13}) (PW|M|P|C|E) (\d{1,2}/\d{1,2}/\d{4}) ?(G[IVX]+)')
SUBCAT = re.compile(r'(?<!\d)(\d{6,13}) ([AB]) ')
OBS = re.compile(r'(?<!\d)(\d{1,4}) (\d{6,13})(?!\d)')
FE_RS = re.compile(r'(?<!\d)\d{1,4} (\d{6,13}) (.+?) (ELECTR[OÓ]NICO EN L[IÍ]NEA|COMPUTARIZAD[OA] EN L[IÍ]NEA|PORTAL WEB EN L[IÍ]NEA)')

MOD = {'EL': 'Electrónica en línea', 'CL': 'Computarizada en línea', 'PWL': 'Portal web en línea', 'PW': 'Portal web',
       'M': 'Manual', 'P': 'Prevalorada', 'C': 'Computarizada', 'E': 'Electrónica'}


def rnd_of(name, text0):
    m = re.search(r'RND[\s\-_]*N?[º°o]?[\s\-_]*(10\d{10,11}|10[\-\s]?\d{4}[\-\s]?\d{2})(?!\d)', text0 or '', re.I)
    if m:
        return re.sub(r'\s', '', m.group(1))
    m = re.search(r'(10\d{10,11}|10[\-]?\d{4,5}[\-]?\d{2})', name)
    return m.group(1) if m else None


DOCS = {
    # categorización PRICO / GRACO / RESTO (posicional)
    'RND-102400000041.pdf': ('categorizacion', None),
    'ANEXO-I-CONTRIBUYENTES-CATEGORIZADOS-GRACO.pdf': ('categorizacion', 'GRACO'),
    'RND-102200000011.pdf': ('categorizacion', 'GRACO'),
    'RND-101800000003.pdf': ('categorizacion_sub', None),
    'RND-10-0009-16ANEXO.pdf': ('categorizacion', None),
    'RND-10-00011-15-ANEXO.pdf': ('categorizacion', None),
    'RND-10-009-14-anexo.pdf': ('categorizacion', None),
    'RND-10-0026-13.pdf': ('categorizacion', 'GRACO'),
    'RND10-0026-11.pdf': ('categorizacion', None),
    'RND10-0007-10.pdf': ('categorizacion', None),
    'RND10-0039-07.pdf': ('portal', None),
    'RND10-0023-06.pdf': ('portal', None),
    'RND10-0027-06.pdf': ('portal', None),
    'RND10-0002-06.pdf': ('portal', None),
    # facturación (modalidad asignada / obligados a facturación electrónica o en línea)
    'RND-102200000024.pdf': ('fe_new', None), 'RND-102300000020.pdf': ('fe_new', None),
    'RND-102400000025.pdf': ('fe_new', None), 'RND-102300000022.pdf': ('fe_new', None),
    'RND-102400000005.pdf': ('fe_new', None), 'RND-102200000010.pdf': ('fe_new', None),
    'RND-102400000012.pdf': ('fe_new', None), 'RND-102400000003.pdf': ('fe_new', None),
    'RND-102100000019.pdf': ('fe_new', None), 'RND-102400000004.pdf': ('fe_new', None),
    'RND-102300000019.pdf': ('fe_new', None), 'RND-102400000002.pdf': ('fe_new', None),
    'ANEXO.pdf': ('fe_rs', None),
    'ANEXO-NIT.pdf': ('fe_2018', None), 'SFE-RND-2019-nits.pdf': ('fe_2019', None),
    'SEPARATA-RND-28.pdf': ('fe_2018', None),
    # NIT observados (facturas sin transacción, domicilio no habido)
    'NOVIEMBRE-2025-NIT-OBSERVADOS.pdf': ('observados', None), 'nits-observados.pdf': ('observados', None),
    # jurisdicción (asignación de NIT a gerencias)
    'ANEXO-RND-10-0011-13.pdf': ('jurisdiccion', None), 'RND-10-011-14-anexo.pdf': ('jurisdiccion', None),
    'RND-10-0031-12.pdf': ('portal', None),
}

nrows = 0
stats = {}
with open(OUT, 'w', encoding='utf-8') as f:
    for name, (kind, catdef) in DOCS.items():
        fn = os.path.join(PDF_DIR, name)
        if not os.path.exists(fn) or name not in scan:
            print('falta', name); continue
        meta = scan[name]
        texts = stream_text(fn)
        rnd = rnd_of(name, texts[0][:3000] + ' ' + (texts[1][:500] if len(texts) > 1 else ''))
        base = {'source': 'sin_listas_publicadas', 'source_url': meta['url'], 'source_date': meta['date'][:10],
                'retrieved_at': NOW, 'matricula': None, 'razon_social': None, 'tipo': None, 'estado': None,
                'actividad': None, 'departamento': None, 'municipio': None, 'direccion': None,
                'adjudicado_por_anio': None}
        rows = []
        if kind in ('categorizacion', 'jurisdiccion', 'portal'):
            for r in parse_positional(fn, {'cat_default': catdef}):
                cat = r['categoria'] if kind == 'categorizacion' else None
                rows.append(dict(base, nit=r['nit'], tipo=None,
                                 estado=(('Categorizado ' + cat) if cat else None) if kind == 'categorizacion' else ('Obligado a declarar por el Portal Tributario' if kind == 'portal' else ('Jurisdicción asignada: ' + r['gerencia'] if r['gerencia'] else None)),
                                 departamento=depto_de(r['gerencia']),
                                 raw={'lista': kind, 'rnd': rnd, 'categoria': cat, 'gerencia_o_encabezado': r['gerencia'],
                                      'pagina': r['pagina'], 'documento': name, 'sha256_pdf': meta['sha256']}))
        elif kind == 'categorizacion_sub':
            for r in parse_positional(fn, {'cat_default': None}):
                rows.append(dict(base, nit=r['nit'], estado=('Categorizado ' + r['categoria']) if r['categoria'] else None,
                                 departamento=depto_de(r['gerencia']),
                                 raw={'lista': 'categorizacion', 'rnd': rnd, 'categoria': r['categoria'],
                                      'gerencia_o_encabezado': r['gerencia'], 'pagina': r['pagina'], 'documento': name,
                                      'sha256_pdf': meta['sha256']}))
            # subcategoría por fila NIT + letra
            subs = {}
            for page in pymupdf.open(fn):
                subs.update(nit_letter_rows(page.get_text()))
            for r in rows:
                if r['nit'] in subs:
                    r['raw']['subcategoria'] = subs[r['nit']]
                    if not r['raw']['categoria']:
                        r['raw']['categoria'] = 'RESTO'
                        r['estado'] = 'Categorizado RESTO subcategoría ' + subs[r['nit']]
        elif kind in ('fe_new', 'fe_2018', 'fe_2019'):
            d = pymupdf.open(fn)
            for pno, page in enumerate(d):
                for rec in fe_rows(page.get_text()):
                    mod = rec['mod']
                    rows.append(dict(base, nit=rec['nit'], estado='Modalidad de facturación asignada: ' + MOD.get(mod, mod.title() if len(mod) > 4 else mod),
                                     departamento=depto_de(rec.get('adm')),
                                     raw={'lista': 'facturacion_modalidad', 'rnd': rnd, 'administracion': rec.get('adm'),
                                          'modalidad': mod, 'fecha_inicio': rec.get('fecha'), 'grupo': rec.get('grupo'),
                                          'pagina': pno + 1, 'documento': name, 'sha256_pdf': meta['sha256']}))
        elif kind == 'fe_rs':
            for pno, t in enumerate(texts):
                for m in FE_RS.finditer(t):
                    rows.append(dict(base, nit=m.group(1), razon_social=m.group(2).strip(),
                                     estado='Modalidad de facturación asignada: ' + m.group(3).title(),
                                     raw={'lista': 'facturacion_modalidad', 'rnd': rnd, 'modalidad': m.group(3), 'pagina': pno + 1,
                                          'documento': name, 'sha256_pdf': meta['sha256']}))
        elif kind == 'observados':
            for pno, page in enumerate(pymupdf.open(fn)):
                for num, nit in numbered_nits(page.get_text()):
                    rows.append(dict(base, nit=nit,
                                     estado='NIT observado por el SIN (emisión de facturas sin transacción / domicilio no habido)',
                                     raw={'lista': 'nit_observados', 'numero_en_lista': num, 'pagina': pno + 1,
                                          'documento': name, 'sha256_pdf': meta['sha256']}))
        # dedup por (nit, documento)
        seen = set()
        k = 0
        for r in rows:
            key = (r['nit'], r['raw'].get('documento'))
            if key in seen or re.match(r'^10\d{10,11}$', r['nit']):
                continue
            seen.add(key)
            f.write(json.dumps(r, ensure_ascii=False) + '\n')
            k += 1
        stats[name] = (kind, rnd, k)
        nrows += k
        print(name, kind, rnd, k, flush=True)
print('TOTAL', nrows)
json.dump(stats, open(OUT + '.stats.json', 'w'), indent=1)
