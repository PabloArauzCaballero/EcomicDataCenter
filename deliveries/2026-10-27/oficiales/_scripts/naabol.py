"""NAABOL: aeropuertos que administra (mapa Leaflet) y sus oficinas (pagina de direcciones).

Uso: python -I naabol.py <dir_descargas> <dir_salida>
 - https://naabol.gob.bo/mapa_aeropuertos/ : arreglo JS `aeropuertos` [lat, lon, nombre, enlace].
 - https://www.naabol.gob.bo/pagina-de-direcciones : tarjetas con direccion, telefono y marcador OSM.
"""
import json
import os
import re
import sys

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
from common import clean, coords, decode, fetch, now_iso, record, write_source  # noqa: E402

MAP = 'https://naabol.gob.bo/mapa_aeropuertos/'
OFFICES = 'https://www.naabol.gob.bo/pagina-de-direcciones'


def main(dl, out):
    retrieved = now_iso()
    rows = []
    html = decode(fetch(MAP, os.path.join(dl, 'mapa_aeropuertos.html')))
    block = re.search(r'var aeropuertos = \[(.*?)\];', html, re.S).group(1)
    for lat, lon, name, link in re.findall(
            r"\[\s*(-?[\d.]+)\s*,\s*(-?[\d.]+)\s*,\s*'([^']*)'\s*,\s*'([^']*)'\s*\]", block):
        la, lo = coords(lat, lon)
        rows.append(record(
            source='naabol', source_id='aeropuerto:' + link.rstrip('/').rsplit('/', 1)[-1],
            name=clean(name), category_raw='Aeropuerto administrado por NAABOL', address=None,
            locality=None, municipality=None, department=None, lat=la, lon=lo, phone=None,
            website=link, hours=None, source_updated_at=None, source_url=MAP, retrieved_at=retrieved,
            raw={'lat': lat, 'lon': lon, 'nombre': name, 'enlace': link},
        ))
    html = decode(fetch(OFFICES, os.path.join(dl, 'direcciones.html')))
    for part in html.split('<div class="card-body">')[1:]:
        title = re.search(r'font-weight: bold;">(.*?)</p>', part, re.S)
        addr = re.search(r'Direcci[oó]n:\s*(.*?)<p', part, re.S)
        if not title or not addr:
            continue
        name = clean(title.group(1))
        tel = re.search(r'Tel[eé]fono:\s*(.*?)</p>', part, re.S)
        mark = re.search(r'marker=(-?[\d.]+)%2C(-?[\d.]+)', part)
        la, lo = coords(*mark.groups()) if mark else (None, None)
        rows.append(record(
            source='naabol', source_id='oficina:' + name, name=name, category_raw='Oficina NAABOL',
            address=clean(addr.group(1)), locality=None, municipality=None, department=None,
            lat=la, lon=lo, phone=clean(tel.group(1)) if tel else None, website=None, hours=None,
            source_updated_at=None, source_url=OFFICES, retrieved_at=retrieved,
            raw={'marker': list(mark.groups()) if mark else None},
        ))
    seen, unique = set(), []
    for r in rows:
        if r['source_id'] in seen:
            continue
        seen.add(r['source_id'])
        unique.append(r)
    rows = unique
    print(json.dumps(write_source(out, 'naabol', rows), ensure_ascii=False))


if __name__ == '__main__':
    main(sys.argv[1], sys.argv[2])
