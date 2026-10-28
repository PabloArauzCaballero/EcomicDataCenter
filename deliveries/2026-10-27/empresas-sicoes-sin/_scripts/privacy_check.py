"""Busca datos personales en la entrega del RUPE: correos, teléfonos y domicilios de personas naturales o unipersonales."""
import sys, gzip, json, re
EMAIL = re.compile(r'[\w.+-]+@[\w-]+\.[\w.-]+')
FONO = re.compile(r'(?i)\b(?:telf?s?|tel[eé]fonos?|cel(?:ular)?|fax|whatsapp|fono|tlf)\b\.?\s*:?\s*\d')
LARGO = re.compile(r'(?<!\d)\d{7,}(?!\d)')
BAD_KEYS = {'telefono', 'fax', 'casillaCorreo', 'correo', 'email', 'responsable'}
hall = []


def walk(o, path, row):
    if isinstance(o, dict):
        for k, v in o.items():
            if k in BAD_KEYS:
                hall.append((row, path + '.' + k, 'clave prohibida'))
            walk(v, path + '.' + k, row)
    elif isinstance(o, list):
        for i, v in enumerate(o):
            walk(v, path + '[%d]' % i, row)
    elif isinstance(o, str):
        if EMAIL.search(o):
            hall.append((row, path, 'correo'))
        if FONO.search(o):
            hall.append((row, path, 'teléfono rotulado'))
        if 'direccion' in path and LARGO.search(o):
            hall.append((row, path, 'número largo en dirección'))


n = 0
with gzip.open(sys.argv[1], 'rt', encoding='utf-8') as f:
    for i, line in enumerate(f):
        r = json.loads(line)
        n += 1
        # el NIT y los códigos son números largos legítimos: se revisan solo textos libres
        walk({k: v for k, v in r.items() if k not in ('nit',)}, '', i)
        t = r.get('tipo') or ''
        if 'Persona Natural' in t and (r.get('direccion') or r.get('razon_social')):
            hall.append((i, 'direccion/razon_social', 'persona natural con domicilio o nombre'))
        if r['raw'].get('unipersonal_presunta') and (r.get('direccion') or any(s.get('direccion') for s in r['raw'].get('sucursales') or [])):
            hall.append((i, 'direccion', 'unipersonal con domicilio'))
print('filas', n, 'hallazgos', len(hall))
for h in hall[:30]:
    print(h)
