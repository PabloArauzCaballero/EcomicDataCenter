"""Escribe manifest.json de la entrega: por fuente, archivo, sha256, filas y cobertura.

Uso: python -I manifest.py <dir_entrega> <metadatos.json>
metadatos.json: {fuente: {source_url, method, data_date, notes}}
Lee cada NDJSON en streaming (gzip linea a linea).
"""
import gzip
import hashlib
import json
import os
import sys

root, meta_path = sys.argv[1], sys.argv[2]
with open(meta_path, encoding='utf-8') as fh:
    meta = json.load(fh)
sources = {}
for name in sorted(os.listdir(root)):
    folder = os.path.join(root, name)
    if not os.path.isdir(folder) or name.startswith('_'):
        continue
    for f in sorted(os.listdir(folder)):
        if not f.endswith('.ndjson.gz'):
            continue
        path = os.path.join(folder, f)
        h = hashlib.sha256()
        with open(path, 'rb') as fh:
            for chunk in iter(lambda: fh.read(1 << 20), b''):
                h.update(chunk)
        rows = coords = address = named = 0
        updated, retrieved, depts = [], set(), 0
        with gzip.open(path, 'rt', encoding='utf-8') as fh:
            for line in fh:
                r = json.loads(line)
                rows += 1
                coords += r['lat'] is not None and r['lon'] is not None
                address += bool(r['address'])
                named += bool(r['name'])
                depts += bool(r['department'])
                if r['source_updated_at']:
                    updated.append(r['source_updated_at'])
                retrieved.add(r['retrieved_at'])
        sources[name] = {
            'file': f'{name}/{f}', 'sha256': h.hexdigest(), 'bytes': os.path.getsize(path), 'rows': rows,
            'rows_with_coords': coords, 'pct_coords': round(100 * coords / rows, 1) if rows else 0,
            'rows_with_address': address, 'rows_with_name': named, 'rows_with_department': depts,
            'source_updated_at_min': min(updated) if updated else None,
            'source_updated_at_max': max(updated) if updated else None,
            'retrieved_at': sorted(retrieved),
            **meta.get(name, {}),
        }
manifest = {
    'delivery': '2026-10-27/oficiales',
    'description': 'Registros oficiales de establecimientos de Bolivia con direccion y coordenadas',
    'format': 'NDJSON gzip, un objeto por linea con los campos normalizados comunes',
    'fields': ['source', 'source_id', 'name', 'category_raw', 'address', 'locality', 'municipality',
               'department', 'lat', 'lon', 'phone', 'website', 'hours', 'source_updated_at', 'source_url',
               'retrieved_at', 'raw'],
    'total_rows': sum(s['rows'] for s in sources.values()),
    'total_rows_with_coords': sum(s['rows_with_coords'] for s in sources.values()),
    'sources': sources,
}
with open(os.path.join(root, 'manifest.json'), 'w', encoding='utf-8', newline='\n') as fh:
    json.dump(manifest, fh, ensure_ascii=False, indent=2)
    fh.write('\n')
for k, s in sources.items():
    print(f"{k:24} {s['rows']:>6} {s['rows_with_coords']:>6} {s['pct_coords']:>5}% addr={s['rows_with_address']} name={s['rows_with_name']} dep={s['rows_with_department']} upd={s['source_updated_at_max']}")
print('TOTAL', manifest['total_rows'], manifest['total_rows_with_coords'])
