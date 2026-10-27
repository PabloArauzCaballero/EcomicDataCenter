"""Oficinas publicadas en la pagina «lista-direcciones-page» de la plantilla AGETIC (.gob.bo).

Uso: python -I gobbo_direcciones.py <dir_descargas> <dir_salida_raiz> slug=url [slug=url ...]
  url = la pagina lista-direcciones-page del sitio.
Cada tarjeta trae «Nombre de oficina», «Dirección», «Teléfono» y un marcador OSM
(marker=lat,lon) que el propio sitio publica. El departamento sale de volver a
pedir la misma pagina filtrada (?departamento=X), que es el filtro del sitio.
La fecha de cada oficina sale de /wp-json/wp/v2/direccion (modified_gmt), por titulo.
"""
import json
import os
import re
import sys
import urllib.parse

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
from common import clean, coords, decode, fetch, now_iso, record, write_source  # noqa: E402

DEPTS = ['Beni', 'Chuquisaca', 'Cochabamba', 'La Paz', 'Oruro', 'Pando', 'Potosí', 'Santa Cruz', 'Tarija']
LABELS = {
    'impuestos': 'Servicio de Impuestos Nacionales (SIN)',
    'mintrabajo': 'Ministerio de Trabajo, Empleo y Prevision Social',
    'seprec': 'Servicio Plurinacional de Registro de Comercio (SEPREC)',
    'abc': 'Administradora Boliviana de Carreteras (ABC)',
    'ylb': 'Yacimientos de Litio Bolivianos (YLB)',
    'aduana': 'Aduana Nacional',
    'asfi': 'Autoridad de Supervision del Sistema Financiero (ASFI)',
    'ibmetro': 'Instituto Boliviano de Metrologia (IBMETRO)',
    'insa': 'Instituto Nacional de Salud Ocupacional (INSO/INSA)',
    'ajam': 'Autoridad Jurisdiccional Administrativa Minera (AJAM)',
    'senarecom': 'Servicio Nacional de Registro y Control de la Comercializacion de Minerales y Metales (SENARECOM)',
}


def cards(html):
    out = []
    for part in html.split('Nombre de oficina:')[1:]:
        name = clean(part.split('</p>')[0])
        addr = re.search(r'Direcci[oó]n:\s*(.*?)</p>', part, re.S)
        tel = re.search(r'Tel[eé]fono:\s*(.*?)</p>', part, re.S)
        mark = re.search(r'marker=(-?[\d.]+)%2C(-?[\d.]+)', part) or \
            re.search(r'mlat=(-?[\d.]+)&(?:amp;)?mlon=(-?[\d.]+)', part)
        out.append({'name': name, 'address': clean(addr.group(1)) if addr else None,
                    'phone': clean(tel.group(1)) if tel else None,
                    'marker': list(mark.groups()) if mark else None})
    return out


def all_pages(dl, slug, url):
    """La primera pagina y, si es Drupal con ?page=N, las siguientes hasta que no aparezca nada nuevo."""
    html = decode(fetch(url, os.path.join(dl, slug, 'lista.html')))
    rows = cards(html)
    pages = 1
    if re.search(r'href="\?page=\d+"', html):
        keys = {(c['name'], c['address']) for c in rows}
        n = 1
        while n < 60:
            sub = decode(fetch(f'{url}?page={n}', os.path.join(dl, slug, f'lista_p{n}.html'), tries=2))
            new = [c for c in cards(sub) if (c['name'], c['address']) not in keys]
            if not new:
                break
            rows += new
            keys |= {(c['name'], c['address']) for c in new}
            n += 1
            pages += 1
    return html, rows, pages


def run(dl, out_root, slug, url, retrieved):
    html, rows, pages = all_pages(dl, slug, url)
    dept_of = {}
    for dept in (DEPTS if 'name="departamento"' in html else []):
        q = url + ('&' if '?' in url else '?') + 'departamento=' + urllib.parse.quote(dept)
        try:
            sub = decode(fetch(q, os.path.join(dl, slug, f'dep_{dept}.html'), tries=2))
        except Exception:  # noqa: BLE001
            continue
        sub_cards = cards(sub)
        if len(sub_cards) == len(rows):  # el filtro no filtra: no sirve para asignar
            continue
        for c in sub_cards:
            dept_of[(c['name'], c['address'])] = dept
    api = url.split('/lista-direcciones-page')[0] + '/wp-json/wp/v2/direccion?per_page=100'
    modified = {}
    try:
        for it in json.loads(fetch(api, os.path.join(dl, slug, 'direccion.json'), tries=1)):
            modified[clean(it['title']['rendered'])] = it
    except Exception:  # noqa: BLE001
        pass
    records, seen = [], set()
    for i, c in enumerate(rows):
        key = (c['name'], c['address'])
        if key in seen:
            continue
        seen.add(key)
        lat, lon = coords(*c['marker']) if c['marker'] else (None, None)
        m = modified.get(c['name'])
        records.append(record(
            source=f'{slug}_oficinas', source_id=str(m['id']) if m else f'{i + 1}:{c["name"]}',
            name=c['name'], category_raw=f'Oficina - {LABELS.get(slug, slug)}',
            address=c['address'], locality=None, municipality=None,
            department=dept_of.get(key), lat=lat, lon=lon, phone=c['phone'] or None,
            website=m['link'] if m else None, hours=None,
            source_updated_at=(m['modified_gmt'] + 'Z') if m else None, source_url=url,
            retrieved_at=retrieved, raw={**c, 'marker_en_bolivia': lat is not None},
        ))
    stats = write_source(os.path.join(out_root, f'{slug}_oficinas'), f'{slug}_oficinas', records)
    stats['with_department'] = sum(1 for r in records if r['department'])
    stats['pages'] = pages
    return stats


def main():
    dl, out_root = sys.argv[1], sys.argv[2]
    retrieved = now_iso()
    result = {}
    for pair in sys.argv[3:]:
        slug, url = pair.split('=', 1)
        try:
            result[slug] = run(dl, out_root, slug, url, retrieved)
        except Exception as exc:  # noqa: BLE001
            result[slug] = {'error': f'{type(exc).__name__}: {exc}'}
        print(slug, json.dumps(result[slug], ensure_ascii=False), flush=True)


if __name__ == '__main__':
    main()
