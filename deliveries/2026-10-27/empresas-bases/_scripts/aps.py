"""APS Registro del Mercado de Seguros (RMS) -> raw json (personas juridicas only)."""
import json, urllib.request, time, sys
API = 'https://api.aps.gob.bo/aps.web/rms'
NATURAL = {451, 452, 453, 454}
FOREIGN = {307, 308}


def get(u):
    for i in range(4):
        try:
            return json.load(urllib.request.urlopen(urllib.request.Request(u, headers={'User-Agent': 'Mozilla/5.0'}), timeout=60))
        except Exception as e:
            print('retry', u, e); time.sleep(5)
    return None


tipos = get(API + '/tipos-entidades')['data']
out = []
for t in tipos:
    c = t['cTipoRegistro']
    if c in NATURAL:
        print('skip natural', t['tTipoRegistro']); continue
    ents = get(API + '/entidades?cTipoRegistro=%d' % c)['data']
    print(c, t['tTipoRegistro'], len(ents))
    for e in ents:
        card = get(API + '/tarjeta?cRegistro=%d' % e['cRegistro'])
        dg = (card or {}).get('data', {}).get('datosgenerales') or {}
        out.append({'tipo': t['tTipoRegistro'], 'cTipoRegistro': c, 'extranjera': c in FOREIGN, 'cRegistro': e['cRegistro'],
                    'nombre': e['tNombre'], 'dg': dg})
        time.sleep(0.3)
json.dump(out, open(sys.argv[1], 'w', encoding='utf-8'), ensure_ascii=False)
print('total', len(out))
