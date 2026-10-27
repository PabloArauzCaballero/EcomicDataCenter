"""ENTEL: multicentros (oficinas comerciales) de la pagina «Nuestros centros de atención».

Uso: python -I entel.py <dir_descargas> <dir_salida>
Cada enlace multicentro.php?id=<base64> lleva el registro completo en JSON
(nombre, direccion, latitud, longitud, horarios, departamento, fechaalta).
"""
import base64
import json
import os
import re
import sys

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
from common import clean, coords, decode, department, fetch, now_iso, record, write_source  # noqa: E402

URL = 'https://institucional.entel.bo/inicio3.0/index.php/atencion-presencial/nuestros-multicentros'


def main(dl, out):
    retrieved = now_iso()
    html = decode(fetch(URL, os.path.join(dl, 'nuestros-multicentros.html')))
    rows, seen = [], set()
    for token in dict.fromkeys(re.findall(r'multicentro\.php\?id=([A-Za-z0-9+/=_-]+)', html)):
        try:
            d = json.loads(base64.b64decode(token + '=' * (-len(token) % 4)))
        except Exception:  # noqa: BLE001
            continue
        key = d.get('idmutlticentro')
        if key in seen:
            continue
        seen.add(key)
        lat, lon = coords(d.get('latitud'), d.get('longitud'))
        rows.append(record(
            source='entel_multicentros', source_id=str(key), name=clean(d.get('nombremulticentro')),
            category_raw='Multicentro ENTEL (oficina comercial)', address=clean(d.get('descripcion')),
            locality=None, municipality=None, department=department(d.get('departamento')), lat=lat, lon=lon,
            phone=None, website='https://institucional.entel.bo/inicio3.0/multicenter/multicentro.php?id=' + token,
            hours=clean(d.get('horarios')),
            source_updated_at=(d.get('fechamodificacion') or d.get('fechaalta') or '').replace('.000+00:00', 'Z') or None,
            source_url=URL, retrieved_at=retrieved, raw=d,
        ))
    print(json.dumps(write_source(out, 'entel_multicentros', rows), ensure_ascii=False))


if __name__ == '__main__':
    main(sys.argv[1], sys.argv[2])
