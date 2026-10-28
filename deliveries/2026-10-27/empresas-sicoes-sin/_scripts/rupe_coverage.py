import sys, os, glob, json, collections
D = sys.argv[1]
heads = json.load(open(os.path.join(D, 'heads.json')))
TIPOS = {'1': 'Persona natural nacional', '10': 'Persona natural extranjera', '11': 'Persona jurídica extranjera',
         '2': 'Empresa', '7': 'Cooperativa', '6': 'OECAS', '12': 'Asociación civil sin fines de lucro', '5': 'APPS',
         '9': 'Entidad / empresa pública', '4': 'Asociación accidental'}
got = collections.Counter()
seen = set()
for t, d, total in heads:
    fn = os.path.join(D, 'pages_%s_%s.jsonl' % (t, d or 'X'))
    u = set()
    if os.path.exists(fn):
        for line in open(fn, encoding='utf-8'):
            try:
                for r in json.loads(line)['rows']:
                    u.add(r['rupe'])
            except Exception:
                pass
    lf = os.path.join(D, 'list_%s_%s.jsonl' % (t, d or 'X'))
    if os.path.exists(lf):
        for line in open(lf, encoding='utf-8'):
            u.add(json.loads(line)['rupe'])
    got[t] += len(u - seen)
    seen |= u
dec = collections.Counter()
for t, d, total in heads:
    dec[t] += total
print('| Tipo (`selTipo`) | Declarados por el portal | Únicos obtenidos | Cobertura |')
print('|---|---:|---:|---:|')
for t in dec:
    print('| %s (%s) | %s | %s | %.1f %% |' % (TIPOS.get(t, t), t, format(dec[t], ',').replace(',', '.'), format(got[t], ',').replace(',', '.'), 100.0 * got[t] / dec[t]))
T, G = sum(dec.values()), sum(got.values())
print('| **Total** | **%s** | **%s** | **%.1f %%** |' % (format(T, ',').replace(',', '.'), format(G, ',').replace(',', '.'), 100.0 * G / T))
