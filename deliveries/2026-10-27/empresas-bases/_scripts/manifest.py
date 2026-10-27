"""Write manifest.json (sha256, rows, field fill rates) for every *.ndjson.gz under ROOT; print markdown table."""
import gzip, hashlib, json, os, sys
sys.path.insert(0, os.path.dirname(__file__))
from common import ROOT, FIELDS, RETRIEVED

KEY = ['matricula', 'nit', 'razon_social', 'tipo_societario', 'estado', 'fecha_inscripcion', 'actividad', 'departamento', 'municipio', 'direccion']
files = []
for d, _, fs in os.walk(ROOT):
    for f in sorted(fs):
        p = os.path.join(d, f)
        rel = os.path.relpath(p, ROOT).replace('\\', '/')
        if rel in ('manifest.json', 'README.md'): continue
        h = hashlib.sha256(open(p, 'rb').read()).hexdigest()
        ent = {'path': rel, 'bytes': os.path.getsize(p), 'sha256': h}
        if f.endswith('.ndjson.gz'):
            n, fill, src_dates = 0, {k: 0 for k in KEY}, set()
            for line in gzip.open(p, 'rt', encoding='utf-8'):
                r = json.loads(line); n += 1
                assert list(r.keys()) == FIELDS, rel
                for k in KEY:
                    if r[k] not in (None, ''): fill[k] += 1
                if r['source_date']: src_dates.add(r['source_date'])
            ent.update({'rows': n, 'fill': fill, 'source_dates': sorted(src_dates)[:12]})
        files.append(ent)
json.dump({'delivery': 'empresas-bases', 'generated_at': RETRIEVED, 'schema': FIELDS, 'files': files},
          open(os.path.join(ROOT, 'manifest.json'), 'w', encoding='utf-8'), ensure_ascii=False, indent=1)
print('| fuente | filas | ' + ' | '.join(KEY) + ' |')
print('|---|---:|' + '---:|' * len(KEY))
for e in files:
    if 'rows' in e:
        print('| %s | %d | ' % (e['path'].split('/')[0], e['rows']) + ' | '.join('%d%%' % round(100 * e['fill'][k] / e['rows']) if e['rows'] else '-' for k in KEY) + ' |')
