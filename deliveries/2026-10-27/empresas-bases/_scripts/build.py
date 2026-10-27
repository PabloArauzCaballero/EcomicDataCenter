"""Normalize all collected raw files into NDJSON.gz per fuente (see common.py for schema)."""
import json, re, os, sys, csv, io, urllib.request
sys.path.insert(0, os.path.dirname(__file__))
from common import rec, write, depto

P = os.path.join(os.path.dirname(__file__), '..', 'pdf')
J = lambda f: json.load(open(os.path.join(P, f), encoding='utf-8'))
STATS = {}

SUFFIX = [(r'\bS\.?\s?R\.?\s?L\.?|\bSOCIEDAD DE RESPONSABILIDAD LIMITADA\b|\bLTDA\.?|\bLIMITADA\b|\bSRL\b', 'Sociedad de Responsabilidad Limitada'),
          (r'\bS\.?\s?A\.?\s?M\.?$|\bSOCIEDAD AN[OÓ]NIMA MIXTA\b', 'Sociedad Anónima Mixta'),
          (r'\bS\.\s?A\.?(?=\s|$|\)|,)|\bSA\.?$|\bSOCIEDAD AN[OÓ]NIMA\b', 'Sociedad Anónima'),
          (r'\bR\.?\s?L\.?$|\bCOOPERATIVA\b', 'Cooperativa'),
          (r'\bSOCIEDAD COLECTIVA\b|\bS\.C\.?$', 'Sociedad Colectiva'),
          (r'\bE\.?I\.?R\.?L\.?\b', 'Empresa Individual de Responsabilidad Limitada'),
          (r'\bSUCURSAL\b', 'Sucursal de sociedad extranjera')]


def tipo_de(nombre):
    n = (nombre or '').upper()
    for rx, t in SUFFIX:
        if re.search(rx, n): return t
    return None


# ---------------- Fundempresa: depuradas y no encontradas ----------------
FUND = [
    ('sep2019.json', 'depurada', '2020-03', 'https://www.fundempresa.org.bo/docs/news/es/16_listado-de-empresas-depuradas-con-cierre-fiscal-al-30-de-septiembre-de-2019.pdf', '20220520102639',
     'Depurada: no actualizó la matrícula de la gestión 2019 (cierre fiscal 30-sep-2019) hasta el 29-feb-2020'),
    ('sep2020.json', 'depurada', '2021-07', 'https://fundempresa.org.bo/docs/news/separata-depuradas-2021compressed_745.pdf', '20210727151400',
     'Depurada: no actualizó la matrícula de la gestión 2020 (cierre fiscal 31-dic-2020) hasta el 30-jun-2021'),
    ('dep2021.json', 'depurada', '2021-09', 'https://www.fundempresa.org.bo/docs/news/es/33_listado-de-empresas-depuradas-con-cierre-de-gestion-fiscal-al-31-de-marzo-de-2021-1.pdf', '20220106183429',
     'Depurada: no actualizó la matrícula de la gestión 2020 (cierre fiscal 31-mar-2021) hasta el 31-ago-2021'),
    ('mar2019.json', 'depurada', '2019-09', 'https://fundempresa.org.bo/docs/news/listado-de-empresas-depuradas-con-cierre-fiscal-al-31-de-marzo-de-2019_446.pdf', '20201220145929',
     'Depurada: no actualizó la matrícula de la gestión 2018 (cierre fiscal 31-mar-2019) hasta el 31-ago-2019'),
]
NOENC = [
    ('noenc2018_7.json', 'no encontrada en la verificación', '2018-09', 'http://fundempresa.org.bo/docs/news/septimo-listado-2018-de-empresas-no-encontradas-en-la-verificacion_369.pdf', '20180922230712',
     'Séptimo listado 2018 de empresas no encontradas en la dirección declarada'),
    ('noenc2019_2.json', 'no encontrada en la verificación', '2019-10', 'https://fundempresa.org.bo/docs/news/segundo-listado-2019-de-empresas-no-encontradas-en-la-verificacion_445.pdf', '20191020213730',
     'Segundo listado 2019 de empresas no encontradas en la dirección declarada'),
]


def fund(lists, fuente):
    rows = []
    for f, estado, sdate, url, ts, desc in lists:
        if not os.path.exists(os.path.join(P, f)):
            print('missing', f); continue
        n = 0
        for r in J(f):
            t = tipo_de(r['razon_social'])
            rows.append(rec(fuente, matricula=r['matricula'], razon_social=r['razon_social'], tipo_societario=t, estado=estado,
                            source_url=url, source_date=sdate,
                            raw={'lista': desc, 'wayback': 'https://web.archive.org/web/%sid_/%s' % (ts, url), 'pagina_pdf': r['page'],
                                 'columna_pdf': r['col'], 'tipo_societario_inferido_del_nombre': t is not None,
                                 'probable_unipersonal': t is None}))
            n += 1
        STATS.setdefault(fuente, {})[f] = n
    return rows


# ---------------- ASFI ----------------
ASFI_FILES = {
    'lic': ('con licencia de funcionamiento', '2026-09-30', 'https://www.asfi.gob.bo/sites/default/files/2026-10/Entidades%20Supervisadas%20con%20Licencia%20de%20Funcionamiento%20al%2030.09.2026.pdf'),
    'con': ('en proceso de constitución', '2026-10-09', 'https://www.asfi.gob.bo/sites/default/files/2026-10/Entidades%20en%20Proceso%20de%20Constituci%C3%B3n%20al%209.10.2026.pdf'),
    'ade': ('en proceso de adecuación', '2026-10-09', 'https://www.asfi.gob.bo/sites/default/files/2026-10/Entidades%20en%20Proceso%20de%20Adecuaci%C3%B3n%20al%209.10.2026.pdf'),
    'dis': ('en disolución y liquidación', '2026-09-30', 'https://www.asfi.gob.bo/sites/default/files/2026-10/Entidades%20en%20Proceso%20de%20Disoluci%C3%B3n%20y%20Liquidaci%C3%B3n%20al%2030.09.2026.pdf'),
    'eif': ('con licencia de funcionamiento', '2026-08-31', 'https://www.asfi.gob.bo/sites/default/files/2026-09/Listado%20general%20de%20las%20entidades%20de%20intermediaci%C3%B3n%20financiera%20con%20licencia%20de%20funcionamiento%2008_2026.pdf'),
    'liq': ('en liquidación', '2026-08-31', 'https://www.asfi.gob.bo/sites/default/files/2026-09/Bancos%20m%C3%BAltiples%20en%20Liquidaci%C3%B3n%2008-2026.pdf'),
    'int': ('en intervención', '2026-08-31', 'https://www.asfi.gob.bo/sites/default/files/2026-09/Bancos%20m%C3%BAltiples%20en%20Intervenci%C3%B3n%2008-2026.pdf'),
    'qui': ('en proceso de quiebra', '2026-08-31', 'https://www.asfi.gob.bo/sites/default/files/2026-09/Cooperativas%20de%20Ahorro%20y%20Cr%C3%A9dito%20Societarias%20en%20Proceso%20de%20Quiebra%2008-2026.pdf'),
}
CAT_FIX = {'Abiertas y Societarias': 'Cooperativas de Ahorro y Crédito Abiertas y Societarias',
           'o con Participación Mayoritaria': 'Entidades Financieras del Estado o con Participación Mayoritaria del Estado',
           'Crédito Societarias en': 'Cooperativas de Ahorro y Crédito Societarias en Proceso de Quiebra',
           None: 'Bancos Múltiples'}
PREFIX = {'Bancos Múltiples': 'Banco ', 'Bancos PYME': 'Banco PYME ', 'Entidades Financieras de Vivienda': 'Entidad Financiera de Vivienda ',
          'Cooperativas de Ahorro y Crédito': 'Cooperativa de Ahorro y Crédito ', 'Cooperativas de Ahorro y Crédito Abiertas y Societarias': 'Cooperativa de Ahorro y Crédito ',
          'Cooperativas de Ahorro y Crédito Societarias en Proceso de Quiebra': 'Cooperativa de Ahorro y Crédito ',
          'Banco Múltiple en Intervención': 'Banco ', 'Banco en Liquidación Voluntaria': 'Banco '}
CITIES = ['Santa Cruz de la Sierra', 'Santa Cruz', 'Cochabamba', 'Bermejo', 'La Paz', 'El Alto', 'Sucre', 'Tarija', 'Oruro', 'Potosí']
CITY_DEP = {'Santa Cruz': 'Santa Cruz', 'Santa Cruz de la Sierra': 'Santa Cruz', 'La Paz': 'La Paz', 'El Alto': 'La Paz', 'Cochabamba': 'Cochabamba',
            'Quillacollo': 'Cochabamba', 'Punata': 'Cochabamba', 'Sacaba': 'Cochabamba', 'Sucre': 'Chuquisaca', 'Oruro': 'Oruro', 'Potosí': 'Potosí',
            'Uyuni': 'Potosí', 'Tupiza': 'Potosí', 'Villazón': 'Potosí', 'Tarija': 'Tarija', 'Yacuiba': 'Tarija', 'Bermejo': 'Tarija',
            'Villamontes': 'Tarija', 'Trinidad': 'Beni', 'Guayaramerín': 'Beni', 'Riberalta': 'Beni', 'Cobija': 'Pando', 'Montero': 'Santa Cruz',
            'Comarapa': 'Santa Cruz', 'Vallegrande': 'Santa Cruz', 'Desaguadero': 'La Paz', 'Copacabana': 'La Paz', 'Chuquisaca': 'Chuquisaca',
            'Puerto Suárez': 'Santa Cruz', 'Puerto Quijarro': 'Santa Cruz', 'Warnes': 'Santa Cruz', 'Camiri': 'Santa Cruz', 'Llallagua': 'Potosí'}


def asfi():
    rows = []
    for k, (estado, sdate, url) in ASFI_FILES.items():
        for r in J('asfi/%s.json' % k):
            nm, ct = r['razon_social'], r['ciudad']
            if ct.startswith('de la Sierra') and nm.endswith('Santa Cruz'):
                nm, ct = nm[:-len('Santa Cruz')].strip(), 'Santa Cruz de la Sierra'
            elif not ct:
                for c in CITIES:
                    if nm.endswith(' ' + c): nm, ct = nm[:-len(c)].strip(), c; break
            nm = re.sub(r'\s+Santa Cruz(?= FINANCIERA)', '', nm)
            cat = CAT_FIX.get(r['categoria'], r['categoria'])
            if cat: cat = cat.replace(' (continuación)', '')
            full = nm
            pre = PREFIX.get(cat)
            if pre and not nm.lower().startswith(pre.strip().lower().split()[0]):
                full = pre + nm
            full = re.sub(r'\s*\((\d|\*)\)\s*$', '', full).replace('(*) No cuenta', '').strip()
            city0 = re.split(r'\s*[-–]\s*', ct)[0].strip() if ct else None
            dep = CITY_DEP.get(city0) or CITY_DEP.get(ct) or depto(city0)
            rows.append(rec('asfi', razon_social=full, tipo_societario=tipo_de(full), estado=estado, actividad=cat,
                            departamento=dep, municipio=ct or None, source_url=url, source_date=sdate,
                            raw={'nombre_en_lista': r['razon_social'], 'sigla_asfi': r['sigla'], 'numero_en_lista': r['num'], 'categoria': r['categoria'],
                                 'departamentos_con_cobertura': r['departamentos_cobertura'], 'pagina_pdf': r['page'], 'aviso_parseo': r.get('aviso')}))
    STATS['asfi'] = len(rows)
    return rows


# ---------------- APS RMS ----------------
NATURAL_TS = {'persona natural', 'unipersonal'}


def aps():
    rows, foreign = [], 0
    for x in J('aps/rms.json'):
        if x['extranjera']:
            foreign += 1; continue
        dg = x['dg']
        ts = (dg.get('tGEN_TipoSociedad') or '').strip()
        nat = ts.lower() in NATURAL_TS
        nombre = dg.get('tGEN_Nombre') or x['nombre']
        tipo = {'S.A.': 'Sociedad Anónima', 'S.R.L.': 'Sociedad de Responsabilidad Limitada', 'SRL': 'Sociedad de Responsabilidad Limitada',
                'LTDA.': 'Sociedad de Responsabilidad Limitada', 'unipersonal': 'Empresa Unipersonal', 'Persona Natural': 'Persona natural'}.get(ts) or tipo_de(nombre)
        rows.append(rec('aps-rms', matricula=dg.get('tGEN_MatriculaSenarec'), nit=dg.get('tGEN_RUC'), razon_social=nombre, tipo_societario=tipo,
                        estado='inscrita en el Registro del Mercado de Seguros', fecha_inscripcion=dg.get('fCON_Fecha') or dg.get('fREG_Resolucion'),
                        actividad=dg.get('tGEN_ActividadEconomica') or x['tipo'], departamento=depto(dg.get('tGEN_Departamento')),
                        municipio=dg.get('tGEN_Ciudad'), direccion=None if nat else dg.get('tGEN_DomicilioLegal'),
                        source_url='https://api.aps.gob.bo/aps.web/rms/tarjeta?cRegistro=%s' % x['cRegistro'], source_date=dg.get('fREP_Actualizacion'),
                        raw={'tipo_registro_rms': x['tipo'], 'codigo_rms': dg.get('tREG_Numero'), 'resolucion_registro': dg.get('tREG_Resolucion'),
                             'fecha_resolucion_registro': dg.get('fREG_Resolucion'), 'fecha_funcionamiento': dg.get('fCON_Funcionamiento'),
                             'sigla': dg.get('tSigla'), 'rotulo_comercial': dg.get('tGEN_RotuloComercial'), 'tipo_sociedad_fuente': ts,
                             'padron_municipal': dg.get('tGEN_NumeroPadronMunicipal'), 'pais': (dg.get('tGEN_Pais') or '').strip() or None,
                             'pagina_web': dg.get('tGEN_PaginaWeb'), 'capital_pagado': dg.get('mCAP_Pagado'),
                             'direccion_omitida': 'persona natural / unipersonal: el domicilio puede ser vivienda' if nat else None,
                             'omitidos_por_privacidad': ['telefono', 'fax', 'correo', 'representante_legal']}))
    STATS['aps-rms'] = {'filas': len(rows), 'extranjeras_excluidas': foreign}
    return rows


# ---------------- BBV ----------------
def bbv():
    rows, pa = [], 0
    for x in J('bbv/bbv.json'):
        NOEMP = {'Fondo de Inversión Abierto', 'Fondo de Inversión Cerrado', 'Patrimonios Autónomos', 'Municipios'}
        if re.search(r'PATRIMONIO AUT', x['nombre'], re.I) or all(s in NOEMP for s in x['sectores']):
            pa += 1; continue
        d = dict(x.get('detalle') or {})
        if d.get('objeto'): d['objeto'] = re.sub(r'^Website:\s*\S+\s*', '', d['objeto'])
        of = d.get('Oficina Central')
        rows.append(rec('bbv', razon_social=x['nombre'], tipo_societario=tipo_de(x['nombre']), estado='participante del mercado de valores (BBV)',
                        actividad='; '.join(x['sectores']), departamento=depto(of), municipio=of.title() if of else None, direccion=d.get('Dirección'),
                        source_url=x['url'], source_date=None,
                        raw={'codigo_bbv': x['codigo'], 'sectores': x['sectores'], 'informacion_al': d.get('Información al'),
                             'website': d.get('Website'), 'objeto_extracto': d.get('objeto')}))
    STATS['bbv'] = {'filas': len(rows), 'fondos_patrimonios_municipios_excluidos': pa}
    return rows


# ---------------- Aduana ----------------
def aduana_oea():
    url = 'https://www.aduana.gob.bo/sites/default/files/oea/pdfOEA/EMPRESAS%20CERTIFICADAS%20OEA%20AL%2005-08-2026.pdf'
    rows = [rec('aduana-oea', nit=r['nit'] or None, razon_social=r['razon_social'], tipo_societario=tipo_de(r['razon_social']),
                estado='OEA: ' + r['estado'].lower(), actividad=r['tipo'], source_url=url, source_date='2026-08-05',
                raw={'nro': r['nro'], 'programa': 'Operador Económico Autorizado'}) for r in J('aduana/oea.json')]
    STATS['aduana-oea'] = len(rows)
    return rows


def aduana_prio(names):
    url = 'https://www.aduana.gob.bo/sites/default/files/prios/LISTA%20DE%20PRINCIPALES%20OPERADORES%20DE%20COMERCIO%20EXTERIOR%20%28PRIO%29.pdf'
    txt = open(os.path.join(P, 'aduana/prio.txt'), encoding='latin-1').read()
    nits = []
    for t in re.findall(r'\b\d{6,13}\b', txt):
        if t not in nits: nits.append(t)
    rows = []
    for n in nits:
        src = names.get(n)
        rows.append(rec('aduana-prio', nit=n, razon_social=src[0] if src else None, estado='Principal Operador de Comercio Exterior (PRIO)',
                        source_url=url, source_date='2026-02-09',
                        raw={'razon_social_tomada_de': src[1] if src else None, 'nota': 'la lista oficial publica solo NIT'}))
    STATS['aduana-prio'] = {'filas': len(rows), 'con_nombre_por_cruce': sum(1 for r in rows if r['razon_social'])}
    return rows


# ---------------- Wikidata ----------------
def wikidata():
    rows = []
    for x in J('wd/wd.json'):
        adm = x['adm'][0] if x['adm'] else None
        hq = x['hq'][0] if x['hq'] else None
        rows.append(rec('wikidata', razon_social=x['label'], tipo_societario=x['legal'][0] if x['legal'] else tipo_de(x['label']),
                        estado='disuelta' if x['dissolved'] else None, fecha_inscripcion=(x['inception'] or '')[:10] or None,
                        actividad='; '.join(x['industry']) or None, departamento=depto(adm) if adm else depto(hq), municipio=hq,
                        source_url='https://www.wikidata.org/wiki/' + x['qid'], source_date='2026-10-27',
                        raw={'qid': x['qid'], 'fecha_es_fundacion_no_inscripcion': True, 'disuelta': x['dissolved'], 'sede': x['hq'],
                             'division_admin_sede': x['adm'], 'website': x['website'], 'lei': x['lei'], 'opencorporates_id': x['opencorporates']}))
    STATS['wikidata'] = len(rows)
    return rows


# ---------------- datos.gob.bo ----------------
def datosgob():
    url = 'https://datos.gob.bo/dataset/37c16682-f1bd-4a18-94bd-097b65f6b763/resource/3a2748b5-e9dc-4e9e-952b-31a9f1e01112/download/puntos_venta_dap1.csv'
    b = urllib.request.urlopen(urllib.request.Request(url, headers={'User-Agent': 'Mozilla/5.0'}), timeout=120).read()
    try: s = b.decode('utf-8')
    except UnicodeDecodeError: s = b.decode('latin-1')
    rows, omitted = [], 0
    for r in csv.DictReader(io.StringIO(s)):
        name = r.get('empresa')
        t = tipo_de(name)
        public = t is not None or re.search(r'EMPRESA|ESTATAL|MINISTERIO|INSTITUTO', name or '', re.I)
        if not public: omitted += 1
        rows.append(rec('datos-gob-bo', razon_social=name, tipo_societario=t, actividad=r.get('tipo'), departamento=depto(r.get('departamen')),
                        direccion=r.get('direccion_') if public else None, source_url=url, source_date='2019-12-06',
                        raw={'conjunto': 'Puntos de Venta Doble Aguinaldo (AGETIC, 2019)', 'sucursal': r.get('sucursal'),
                             'productos': r.get('nombre_del_producto'), 'cartodb_id': r.get('cartodb_id'),
                             'lat': r.get('latitud') if public else None, 'lon': r.get('longitud') if public else None,
                             'direccion_omitida': None if public else 'probable persona natural/unipersonal: el punto puede ser vivienda',
                             'licencia': 'CC-BY (datos.gob.bo)'}))
    STATS['datos-gob-bo'] = {'filas': len(rows), 'direccion_omitida': omitted}
    return rows


if __name__ == '__main__':
    files = {}
    fd = fund(FUND, 'fundempresa-depuradas'); files['fundempresa-depuradas'] = write('fundempresa-depuradas', fd)
    ne = fund(NOENC, 'fundempresa-no-encontradas'); files['fundempresa-no-encontradas'] = write('fundempresa-no-encontradas', ne)
    a = asfi(); write('asfi', a)
    ap = aps(); write('aps-rms', ap)
    bb = bbv() if os.path.exists(os.path.join(P, 'bbv/bbv.json')) else []
    if bb: write('bbv', bb)
    oe = aduana_oea(); write('aduana-oea', oe)
    names = {}
    import gzip
    for src, rs in (('aduana-oea', oe), ('aps-rms', ap)):
        for r in rs:
            if r['nit'] and r['nit'] not in names: names[r['nit']] = (r['razon_social'], src)
    import common
    gp = os.path.join(common.ROOT, 'gleif', 'gleif.ndjson.gz')
    for l in gzip.open(gp, 'rt', encoding='utf-8'):
        r = json.loads(l)
        if r['nit'] and r['nit'] not in names: names[r['nit']] = (r['razon_social'], 'gleif')
    pr = aduana_prio(names); write('aduana-prio', pr)
    wd = wikidata(); write('wikidata', wd)
    dg = datosgob(); write('datos-gob-bo', dg)
    json.dump(STATS, open(os.path.join(P, 'stats.json'), 'w', encoding='utf-8'), ensure_ascii=False, indent=1)
    print(json.dumps(STATS, ensure_ascii=False, indent=1))
