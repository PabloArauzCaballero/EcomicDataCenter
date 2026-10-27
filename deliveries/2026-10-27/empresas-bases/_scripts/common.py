import gzip, json, os, datetime, hashlib

ROOT = r'C:/Users/Usuario/Downloads/Entrypoint-GitHUb/ObservatorioEconomico/EcomicDataCenter/.claude/worktrees/agent-a14ecb6c6a22d08c2/deliveries/2026-10-27/empresas-bases'
RETRIEVED = datetime.datetime.now(datetime.timezone.utc).replace(microsecond=0).isoformat()
FIELDS = ['source', 'matricula', 'nit', 'razon_social', 'tipo_societario', 'estado', 'fecha_inscripcion',
          'actividad', 'departamento', 'municipio', 'direccion', 'source_url', 'source_date', 'retrieved_at', 'raw']

DEPTOS = {'LA PAZ': 'La Paz', 'COCHABAMBA': 'Cochabamba', 'SANTA CRUZ': 'Santa Cruz', 'ORURO': 'Oruro', 'POTOSI': 'Potosí',
          'POTOSÍ': 'Potosí', 'CHUQUISACA': 'Chuquisaca', 'TARIJA': 'Tarija', 'BENI': 'Beni', 'PANDO': 'Pando'}


def depto(v):
    if not v: return None
    k = v.strip().upper()
    for a, b in DEPTOS.items():
        if k == a or k.startswith(a): return b
    return v.strip()


def rec(source, **kw):
    r = {f: None for f in FIELDS}
    r['source'] = source; r['retrieved_at'] = RETRIEVED
    for k, v in kw.items():
        assert k in FIELDS, k
        if isinstance(v, str): v = ' '.join(v.split()) or None
        r[k] = v
    return r


def write(fuente, rows):
    d = os.path.join(ROOT, fuente); os.makedirs(d, exist_ok=True)
    p = os.path.join(d, fuente + '.ndjson.gz')
    with gzip.open(p, 'wt', encoding='utf-8', compresslevel=9) as f:
        for r in rows:
            f.write(json.dumps(r, ensure_ascii=False) + '\n')
    print('wrote', len(rows), p)
    return p
