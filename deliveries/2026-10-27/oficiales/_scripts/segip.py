"""SEGIP: oficinas (https://www.segip.gob.bo/oficina/ y /page/N/), con el marcador OSM de cada tarjeta.

Uso: python -I segip.py <dir_descargas> <dir_salida>
Las fechas de modificacion salen de /wp-json/wp/v2/oficina (por slug).
Se quedan solo las oficinas en Bolivia (las del exterior no son lugares de Bolivia).
"""
import json
import os
import re
import sys

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
from common import clean, coords, decode, department, fetch, now_iso, record, write_source  # noqa: E402

BASE = 'https://www.segip.gob.bo/oficina/'


def main(dl, out):
    retrieved = now_iso()
    meta = {}
    page = 1
    while True:
        url = f'https://www.segip.gob.bo/wp-json/wp/v2/oficina?per_page=100&page={page}'
        try:
            items = json.loads(fetch(url, os.path.join(dl, f'api_{page}.json')))
        except Exception:  # noqa: BLE001
            break
        if not items:
            break
        for it in items:
            meta[clean(it['title']['rendered']).replace('–', '-')] = it
        page += 1
    rows, seen = [], set()
    page = 1
    while True:
        url = BASE if page == 1 else f'{BASE}page/{page}/'
        try:
            html = decode(fetch(url, os.path.join(dl, f'page_{page}.html'), tries=1))
        except Exception:  # noqa: BLE001
            break
        cards = re.split(r'<article class="card oficina-card">', html)[1:]
        if not cards:
            break
        for card in cards:
            card = card.split('</article>')[0]
            title = clean(re.search(r'oficina-titulo-card">(.*?)</h2>', card, re.S).group(1))
            tipo = clean((re.search(r'oficina-tipo">(.*?)</div>', card, re.S) or [None, None])[1])
            meta_line = clean((re.search(r'oficina-meta">(.*?)</p>', card, re.S) or [None, None])[1])
            address = clean((re.search(r'oficina-direccion">(.*?)</p>', card, re.S) or [None, None])[1])
            hours = clean((re.search(r'oficina-horario">(.*?)</div>', card, re.S) or [None, None])[1])
            hours = hours.replace('Horario de atención:', '').strip() if hours else None
            dep = clean((re.search(r'oficina-dependiente">(.*?)</div>', card, re.S) or [None, None])[1])
            services = [clean(s) for s in re.findall(r'badge-servicio">(.*?)</span>', card, re.S)]
            mark = re.search(r'mlat=(-?[\d.]+)&(?:amp;)?mlon=(-?[\d.]+)', card)
            country, dept = None, None
            if meta_line:
                parts = [p.strip() for p in meta_line.split(' - ')]
                country = parts[0]
                dept = parts[1] if len(parts) > 1 else None
            if country and country.lower() != 'bolivia':
                continue
            lat, lon = coords(*mark.groups()) if mark else (None, None)
            key = (title, address)
            if key in seen:
                continue
            seen.add(key)
            m = meta.get(title.replace('–', '-'))
            rows.append(record(
                source='segip_oficinas', source_id=str(m['id']) if m else title,
                name=title, category_raw=f'Oficina SEGIP ({tipo})' if tipo else 'Oficina SEGIP',
                address=address, locality=None, municipality=None, department=department(dept),
                lat=lat, lon=lon, phone=None, website=m['link'] if m else BASE, hours=hours,
                source_updated_at=m['modified_gmt'] + 'Z' if m else None, source_url=url,
                retrieved_at=retrieved,
                raw={'tipo': tipo, 'pais_departamento': meta_line, 'dependencia': dep, 'servicios': services,
                     'marker': list(mark.groups()) if mark else None},
            ))
        page += 1
    stats = write_source(out, 'segip_oficinas', rows)
    stats['pages'] = page - 1
    stats['api_items'] = len(meta)
    print(json.dumps(stats, ensure_ascii=False))


if __name__ == '__main__':
    main(sys.argv[1], sys.argv[2])
