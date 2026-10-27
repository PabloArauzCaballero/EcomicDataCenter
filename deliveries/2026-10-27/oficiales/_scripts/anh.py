"""ANH: operadores licenciados por actividad, con la coordenada del boton setMark.

Uso: python -I anh.py <dir_descargas> <dir_salida>
Lee https://www.anh.gob.bo/w2026/contenido.php?s=40&R=<actividad>&D=0 (listado nacional).
Excluye las actividades de consumidores (vehiculos, bidoneros, agricolas: son
personas o vehiculos, no establecimientos) y el transporte en cisterna.
"""

import json
import os
import re
import sys

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
from common import clean, coords, decode, department, fetch, now_iso, record, sha256_bytes, write_source  # noqa: E402

BASE = 'https://www.anh.gob.bo/w2026/contenido.php?s=40&R={r}&D=0'
SKIP = {37, 40, 41, 48, 49, 51, 97, 98, 99, 100, 101, 102, 103, 104, 105, 109}


def activities(html):
    found = {}
    for r, name in re.findall(r"R=(\d+)&D=0'[^>]*>([^<]*)", html):
        found[int(r)] = clean(name)
    found[1] = 'COMERCIALIZACION DE COMBUSTIBLES LIQUIDOS EN ESTACION DE SERVICIO'
    return found


def rows_of(html):
    head = re.search(r'<thead>(.*?)</thead>', html, re.S)
    headers = [clean(h).upper() for h in re.findall(r'<th[^>]*>(.*?)</th>', head.group(1), re.S)] if head else []
    body = html[html.find('<tbody>'):]
    body = body[:body.find('</tbody>')] if '</tbody>' in body else body
    for tr in re.findall(r'<tr>(.*?)</tr>', body, re.S):
        cells = re.findall(r'<td[^>]*>(.*?)</td>', tr, re.S)
        if len(cells) < 3:
            continue
        yield headers, cells


def main(dl, out):
    retrieved = now_iso()
    index_html = decode(fetch(BASE.format(r=1), os.path.join(dl, 'r1.html')))
    acts = activities(index_html)
    rows, per_activity, sources = [], {}, []
    for r in sorted(acts):
        if r in SKIP:
            continue
        url = BASE.format(r=r)
        body = fetch(url, os.path.join(dl, f'r{r}.html'))
        html = decode(body)
        sources.append({'activity': r, 'name': acts[r], 'url': url, 'sha256': sha256_bytes(body)})
        n = 0
        for headers, cells in rows_of(html):
            texts = [clean(c) for c in cells]
            by = {}
            for h, c, t in zip(headers, cells, texts):
                by[h] = (c, t)
            mark = re.search(r'setMark\(\s*(-?[\d.]+)\s*,\s*(-?[\d.]+)\s*,', tr_join(cells))
            name = texts[0]
            address = phone = licence = products = dept = None
            for h, (c, t) in by.items():
                if h.startswith('CONTACTO'):
                    plain = re.sub(r'<br\s*/?>', '\n', c)
                    plain = re.sub(r'<[^>]+>', '', plain)
                    m = re.search(r'DIRECCI.{1,3}N:\s*([^\n]*)', plain)
                    address = clean(m.group(1)) if m else None
                    m = re.search(r'TEL.{1,3}FONO:\s*([^\n]*)', plain)
                    phone = clean(m.group(1)) if m else None
                elif h.startswith('DIRECCI'):
                    address = t
                elif h.startswith('TEL'):
                    phone = t
                elif h.startswith('LICENCIA'):
                    licence = t
                elif h.startswith('PRODUCTO'):
                    products = t
                elif h.startswith('DEPARTAMENTO'):
                    dept = t
                elif h.startswith('UBICACI'):
                    dept = dept or clean(c.split('<a')[0])
            category_detail = None
            if 'INFORMACI' in ' '.join(headers):
                # Instaladores (R=46): nombre<br/>RA; la celda trae el nombre del
                # representante legal, que es una persona y no viaja.
                name = clean(cells[0].split('<br')[0])
                ra = re.search(r'RA:\s*([^<]*)</b>\s*([^<]*)', cells[0])
                licence = clean(' '.join(ra.groups())) if ra else None
                info = re.sub(r'<br\s*/?>', '\n', cells[1])
                info = re.sub(r'<[^>]+>', '', info)
                m = re.search(r'Direcci.{1,3}n:\s*([^\n]*)', info)
                address = clean(m.group(1)) if m else None
                m = re.search(r'Tel.{1,3}fono:\s*([^\n]*)', info)
                phone = clean(m.group(1)) if m else None
                m = re.search(r'Categor.{1,3}a:\s*([^\n]*)', info)
                category_detail = clean(m.group(1)) if m else None
                district = re.search(r'\b(DLP|DSC|DCB|DOR|DPT|DCH|DTJ|DBN|DPD)\b', licence or '')
                dept = {'DLP': 'LA PAZ', 'DSC': 'SANTA CRUZ', 'DCB': 'COCHABAMBA', 'DOR': 'ORURO',
                        'DPT': 'POTOSI', 'DCH': 'CHUQUISACA', 'DTJ': 'TARIJA', 'DBN': 'BENI',
                        'DPD': 'PANDO'}.get(district.group(1)) if district else None
                texts = [name, licence, address, category_detail]
            lat, lon = (None, None)
            if mark:
                lat, lon = coords(mark.group(1), mark.group(2))
            operator = re.match(r'(ANH\d+-[A-Z]+\d+)', licence or '')
            sid = f'R{r}:' + (operator.group(1) if operator else
                              sha256_bytes(f'{name}|{address}|{dept}'.encode())[:16])
            rows.append(record(
                source='anh_operadores', source_id=sid, name=name,
                category_raw=acts[r], address=address or None, locality=None,
                municipality=None, department=department(dept), lat=lat, lon=lon,
                phone=phone or None, website=None, hours=None,
                source_updated_at=None, source_url=url, retrieved_at=retrieved,
                raw={'actividad_R': r, 'cells': texts, 'licencia': licence, 'productos': products,
                     'categoria': category_detail,
                     'setMark': [mark.group(1), mark.group(2)] if mark else None},
            ))
            n += 1
        per_activity[r] = n
    # de-duplicate exact repeats within the same activity
    seen, unique = set(), []
    for row in rows:
        key = (row['source_id'], row['name'], row['address'])
        if key in seen:
            continue
        seen.add(key)
        unique.append(row)
    stats = write_source(out, 'anh_operadores', unique)
    stats['per_activity'] = {str(k): v for k, v in per_activity.items()}
    stats['downloads'] = sources
    stats['retrieved_at'] = retrieved
    print(json.dumps(stats, ensure_ascii=False, indent=1))


def tr_join(cells):
    return ' '.join(cells)


if __name__ == '__main__':
    main(sys.argv[1], sys.argv[2])
