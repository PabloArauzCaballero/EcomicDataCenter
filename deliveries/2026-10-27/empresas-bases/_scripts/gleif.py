import json, urllib.request, urllib.parse, sys, os
sys.path.insert(0, os.path.dirname(__file__))
from common import rec, write, depto

ISO_REG = {'BO-L': 'La Paz', 'BO-C': 'Cochabamba', 'BO-S': 'Santa Cruz', 'BO-O': 'Oruro', 'BO-P': 'Potosí',
           'BO-H': 'Chuquisaca', 'BO-T': 'Tarija', 'BO-B': 'Beni', 'BO-N': 'Pando'}
API = 'https://api.gleif.org/api/v1/lei-records?'


def fetch(filt):
    out, page = [], 1
    while True:
        q = {filt: 'BO', 'page[size]': 200, 'page[number]': page}
        d = json.load(urllib.request.urlopen(urllib.request.Request(API + urllib.parse.urlencode(q), headers={'Accept': 'application/vnd.api+json'}), timeout=60))
        out += d['data']
        if page >= d['meta']['pagination']['lastPage']: return out, d['meta']['goldenCopy']['publishDate']
        page += 1


legal, pub = fetch('filter[entity.legalAddress.country]')
hq = []
seen = {x['id']: x for x in legal}
for x in hq: seen.setdefault(x['id'], x)
# ELF names for legal forms
elf = {}
for x in seen.values():
    lf = x['attributes']['entity'].get('legalForm') or {}
    if lf.get('id') and lf['id'] not in elf and lf['id'] != '8888':
        try:
            e = json.load(urllib.request.urlopen('https://api.gleif.org/api/v1/entity-legal-forms/' + lf['id'], timeout=60))['data']['attributes']
            elf[lf['id']] = e['names'][0]['localName']
        except Exception as ex:
            elf[lf['id']] = None
rows = []
for lei, x in sorted(seen.items()):
    a = x['attributes']; e = a['entity']; la = e['legalAddress']; ha = e['headquartersAddress']; rg = a['registration']
    addr = la if la.get('country') == 'BO' else ha
    lf = e.get('legalForm') or {}
    reg_as = e.get('registeredAs')
    rows.append(rec('gleif',
        matricula=reg_as,
        nit=reg_as if (reg_as and reg_as.isdigit() and len(reg_as) >= 9 and not reg_as.startswith('00')) else None,
        razon_social=e['legalName']['name'],
        tipo_societario=elf.get(lf.get('id')) or lf.get('other') or lf.get('id'),
        estado=e.get('status'),
        fecha_inscripcion=(e.get('creationDate') or '')[:10] or None,
        departamento=ISO_REG.get(addr.get('region')) or depto(addr.get('city')),
        municipio=addr.get('city'),
        direccion=', '.join(addr.get('addressLines') or []),
        source_url='https://api.gleif.org/api/v1/lei-records/' + lei,
        source_date=pub[:10],
        raw={'lei': lei, 'registeredAt': (e.get('registeredAt') or {}).get('id'), 'legalForm': lf.get('id'),
             'category': e.get('category'), 'jurisdiction': e.get('jurisdiction'),
             'legalAddressCountry': la.get('country'), 'hqCountry': ha.get('country'),
             'registrationStatus': rg.get('status'), 'initialRegistrationDate': rg.get('initialRegistrationDate'),
             'nextRenewalDate': rg.get('nextRenewalDate'), 'managingLou': rg.get('managingLou'),
             'nit_heuristica': 'registeredAs de 9+ digitos sin ceros iniciales se copia a nit (desde la unificacion matricula=NIT)', 'otherNames': [n['name'] for n in e.get('otherNames') or []]}))
print('legal BO', len(legal), 'hq BO', len(hq), 'union', len(rows), 'golden copy', pub)
write('gleif', rows)
for r in rows[:5]: print(json.dumps(r, ensure_ascii=False)[:400])
