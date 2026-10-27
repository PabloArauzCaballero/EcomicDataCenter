"""GAMLP (La Paz): mercados municipales y mercados moviles (ferias) del GeoServer municipal.

Uso: python -I lapaz_mercados.py <dir_descargas> <dir_salida>
WFS https://sitservicios.lapaz.bo/geoserver/ows capas sit:mercados y sit:mercadosmoviles (EPSG:4326).
Los campos `usuario` y `owner` (cuenta del funcionario que edito la capa) no viajan.
"""
import json
import os
import sys

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
from common import clean, coords, fetch, now_iso, record, write_source  # noqa: E402

WFS = ('https://sitservicios.lapaz.bo/geoserver/ows?service=WFS&version=2.0.0&request=GetFeature'
       '&typeNames={layer}&outputFormat=application/json&srsName=EPSG:4326')
PERSONAL = {'usuario', 'owner'}


def main(dl, out):
    retrieved = now_iso()
    rows = []
    for layer, label in (('sit:mercados', 'Mercado municipal'), ('sit:mercadosmoviles', 'Mercado movil / feria')):
        url = WFS.format(layer=layer)
        data = json.loads(fetch(url, os.path.join(dl, layer.replace(':', '_') + '.json')))
        for f in data['features']:
            p = {k: v for k, v in f['properties'].items() if k not in PERSONAL}
            low = {k.lower(): v for k, v in p.items()}
            lon, lat = (f['geometry']['coordinates'][:2] if f.get('geometry') and f['geometry']['type'] == 'Point'
                        else (None, None))
            la, lo = coords(lat, lon)
            rows.append(record(
                source='lapaz_mercados', source_id=f'{layer}:{f.get("id")}', name=clean(low.get('nombre')),
                category_raw=f"{label}" + (f" ({clean(low.get('tipo'))})" if low.get('tipo') else ''),
                address=clean(low.get('direccion')), locality=clean(low.get('zona')),
                municipality='La Paz', department='La Paz', lat=la, lon=lo, phone=None, website=None,
                hours=None, source_updated_at=low.get('fechaactual'), source_url=url,
                retrieved_at=retrieved, raw=p,
            ))
    print(json.dumps(write_source(out, 'lapaz_mercados', rows), ensure_ascii=False))


if __name__ == '__main__':
    main(sys.argv[1], sys.argv[2])
