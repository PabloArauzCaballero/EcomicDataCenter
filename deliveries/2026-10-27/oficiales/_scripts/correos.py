"""Agencia Boliviana de Correos (AGBC): oficinas del «Mapa de Oficinas» de la portada.

Uso: python -I correos.py <dir_descargas> <dir_salida>
Fuente: https://www.correos.gob.bo/frontapi/api/site/pages/home (items type=office).
La coordenada sale del enlace maps_url que la propia AGBC publica para cada oficina
(se sigue la redireccion del enlace corto; no se geocodifica).
"""
import json
import os
import sys

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
from common import clean, coords, fetch, now_iso, record, write_source  # noqa: E402
from gmaps import resolve  # noqa: E402

API = 'https://www.correos.gob.bo/frontapi/api/site/pages/home'
DEPT = {'BOL': 'La Paz', 'BON': 'Pando', 'BOB': 'Beni', 'BOO': 'Oruro', 'BOC': 'Cochabamba',
        'BOS': 'Santa Cruz', 'BOP': 'Potosí', 'BOH': 'Chuquisaca', 'BOT': 'Tarija'}
PIN = {'place_pin_3d4d', 'query_latlon', 'place_latlon'}


def offices(node):
    if isinstance(node, dict):
        if node.get('type') == 'office' and isinstance(node.get('data'), dict):
            yield node
        for v in node.values():
            yield from offices(v)
    elif isinstance(node, list):
        for v in node:
            yield from offices(v)


def main(dl, out):
    retrieved = now_iso()
    data = json.loads(fetch(API, os.path.join(dl, 'home.json')))
    rows, seen = [], set()
    for item in offices(data):
        if item['id'] in seen:
            continue
        seen.add(item['id'])
        d = item['data']
        final, found = (None, None)
        if d.get('maps_url'):
            try:
                final, found = resolve(d['maps_url'])
            except Exception as exc:  # noqa: BLE001
                final, found = f'ERR {type(exc).__name__}', None
        lat, lon = (coords(found[0], found[1]) if found and found[2] in PIN else (None, None))
        rows.append(record(
            source='correos_agbc', source_id=str(item['id']), name=clean(d.get('title') or item['name']),
            category_raw='Oficina de Correos (AGBC)', address=clean(d.get('address')), locality=None,
            municipality=None, department=DEPT.get(str(d.get('dept', '')).upper()), lat=lat, lon=lon,
            phone=clean(d.get('phone')), website=None, hours=clean(d.get('hours')),
            source_updated_at=None, source_url=API, retrieved_at=retrieved,
            raw={**d, 'is_active': item.get('is_active'), 'maps_url_final': final,
                 'coord_from_link': list(found) if found else None},
        ))
    print(json.dumps(write_source(out, 'correos_agbc', rows), ensure_ascii=False))


if __name__ == '__main__':
    main(sys.argv[1], sys.argv[2])
