"""Verificador de privacidad de la entrega (independiente de build_delivery.py: no importa nada de él).

Uso:  python -P privacy_check.py RUPE.ndjson.gz [SIN.ndjson.gz]   -> sale con 1 si hay hallazgos
      python -P privacy_check.py --selftest                       -> prueba el detector con casos sintéticos

Busca, en los campos de texto libre publicados:
  - correos;
  - teléfonos, también escritos con separadores («7 123 4567», «2-245-678», «(591) 7…»): el texto se normaliza con
    NFKC, se quitan espacios, guiones, puntos y paréntesis entre dígitos y se busca toda corrida de 7 o más dígitos;
  - claves de contacto (telefono, fax, casilla, correo, responsable);
  - nombre o domicilio de personas naturales;
  - domicilio de empresas unipersonales: toda «Empresa…» sin forma societaria reconocida, o con UNIPERSONAL en el nombre.
"""
import sys, gzip, json, re, unicodedata

EMAIL = re.compile(r'[\w.+-]+@[\w-]+\.[\w.-]+')
SEP_ENTRE_DIGITOS = re.compile(r'(?<=\d)[\s\-.()]+(?=\d)')
CORRIDA = re.compile(r'\d{7,}')
RESPALDO = re.compile(r'(?<!\d)(?:\+?591[\s-]?)?[2-7](?:[\s.\-]?\d){6,7}(?!\d)')
BAD_KEYS = {'telefono', 'fax', 'casilla', 'casillaCorreo', 'correo', 'email', 'responsable'}
FORMA_LEGAL = re.compile(
    r'\bS ?R ?L\b|\bS ?A\b|\bLTDA\b|\bLIMITADA\b|\bS ?A ?C\b|\bS ?C ?S\b|\bS ?C ?A\b|COOPERATIVA|ASOCIACION|FUNDACION|'
    r'SOCIEDAD ACCIDENTAL|SOCIEDAD ANONIMA|RESPONSABILIDAD LIMITADA')


def norm(s):
    return unicodedata.normalize('NFKC', s)


def telefonos(s):
    """Devuelve las corridas de 7+ dígitos (tras unir dígitos separados) y los aciertos del patrón de respaldo."""
    if not s:
        return []
    t = norm(s)
    out = CORRIDA.findall(SEP_ENTRE_DIGITOS.sub('', t))
    out += [m.group(0) for m in RESPALDO.finditer(t)]
    return out


def sin_tildes(s):
    return ''.join(c for c in unicodedata.normalize('NFKD', s) if not unicodedata.combining(c))


def forma_legal(nombre):
    if not nombre:
        return False
    u = sin_tildes(norm(nombre)).upper().replace('.', ' ').replace(',', ' ')
    u = ' '.join(u.split())
    if 'UNIPERSONAL' in u:
        return False
    return bool(FORMA_LEGAL.search(u))


def es_unipersonal(tipo, nombre):
    return bool(tipo and tipo.startswith('Empresa') and not forma_legal(nombre))


def textos_libres(r):
    raw = r.get('raw') or {}
    yield 'razon_social', r.get('razon_social')
    yield 'direccion', r.get('direccion')
    yield 'raw.nombre_comercial', raw.get('nombre_comercial')
    yield 'raw.provincia_o_ciudad', raw.get('provincia_o_ciudad')
    for i, s in enumerate(raw.get('sucursales') or []):
        if isinstance(s, dict):
            for k, v in s.items():
                yield 'raw.sucursales[%d].%s' % (i, k), v
        else:
            yield 'raw.sucursales[%d]' % i, json.dumps(s, ensure_ascii=False)


def claves(o, path=''):
    if isinstance(o, dict):
        for k, v in o.items():
            if k in BAD_KEYS:
                yield path + '.' + k
            yield from claves(v, path + '.' + k)
    elif isinstance(o, list):
        for i, v in enumerate(o):
            yield from claves(v, '%s[%d]' % (path, i))


def revisar(fn, hall):
    n = 0
    with gzip.open(fn, 'rt', encoding='utf-8') as f:
        for i, line in enumerate(f):
            r = json.loads(line)
            n += 1
            for p in claves(r):
                hall.append((fn, i, p, 'clave de contacto'))
            if EMAIL.search(line):
                hall.append((fn, i, '*', 'correo'))
            for campo, v in textos_libres(r):
                if isinstance(v, str) and telefonos(v):
                    hall.append((fn, i, campo, 'teléfono'))
            tipo = r.get('tipo') or ''
            raw = r.get('raw') or {}
            if 'Persona Natural' in tipo and (r.get('direccion') or r.get('razon_social') or raw.get('nombre_comercial')):
                hall.append((fn, i, 'direccion/razon_social', 'persona natural con nombre o domicilio'))
            if r.get('source') == 'sin_listas_publicadas' and r.get('razon_social') and not forma_legal(r['razon_social']):
                hall.append((fn, i, 'razon_social', 'SIN: nombre sin forma societaria (posible persona natural)'))
            if es_unipersonal(tipo, r.get('razon_social')):
                if r.get('direccion'):
                    hall.append((fn, i, 'direccion', 'unipersonal con domicilio'))
                if any(isinstance(s, dict) and s.get('direccion') for s in raw.get('sucursales') or []):
                    hall.append((fn, i, 'raw.sucursales', 'unipersonal con domicilio de sucursal'))
    return n


def selftest():
    con = ['Calle 1 Nro 23, telf 7 123 4567', 'Av. Busch 2-245-678', '(591) 71234567', '+591 2 2456789', 'cel. 7.123.45.67',
           'Zona Sur (591)-2-245-6789', '７１２３４５６７']
    sin = ['Calle Canonigo Ayllon Nro. 584 San Pedro', 'Av. 6 de Agosto 2170, piso 3', 'Km 7.5 carretera al norte',
           'Calle 21 Nro 1234 2do piso', 'Manzana 12 Lote 34 UV 56']
    ok = all(telefonos(x) for x in con) and not any(telefonos(x) for x in sin)
    for x in con + sin:
        print('%-45s -> %s' % (x, telefonos(x)))
    casos = [('Empresa-Persona Jurídica', 'MULTI-STOCK S.R.L.', False), ('Empresa-Persona Jurídica', 'KALIFRA LTDA', False),
             ('Empresa-Persona Jurídica', 'BANCO X S. A.', False), ('Empresa-Persona Jurídica', 'IMPORTADORA PEREZ', True),
             ('Empresa-Persona Jurídica', 'CONSTRUCTORA JUAN MAMANI', True), ('Empresa-Persona Jurídica', 'EMPRESA UNIPERSONAL LUZ S.R.L.', True),
             ('Empresa-Persona Jurídica', 'CALAMANI CHURA FELIX', True), ('Cooperativa-Persona Jurídica', 'COOP LA MERCED', False)]
    for t, nmb, esp in casos:
        got = es_unipersonal(t, nmb)
        ok &= got == esp
        print('%-40s unipersonal=%s (esperado %s)' % (nmb, got, esp))
    print('SELFTEST', 'OK' if ok else 'FALLA')
    return ok


if __name__ == '__main__':
    if sys.argv[1:] == ['--selftest']:
        sys.exit(0 if selftest() else 1)
    hall = []
    total = sum(revisar(fn, hall) for fn in sys.argv[1:])
    print('filas', total, 'hallazgos', len(hall))
    for h in hall[:30]:
        print(h)
    sys.exit(1 if hall else 0)
