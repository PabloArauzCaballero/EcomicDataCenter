"""ATT: oficinas de la Autoridad de Regulacion y Fiscalizacion de Telecomunicaciones y Transportes.

Uso: python -I att.py <dir_descargas> <dir_salida>
Fuente: https://www.att.gob.bo/contactanos (bloque «Contactos»). Solo traen direccion:
lat/lon quedan vacios (el mapa embebido es el encuadre de la camara, no un marcador).
"""
import json
import os
import re
import sys

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
from common import clean, decode, fetch, now_iso, record, write_source  # noqa: E402

URL = 'https://www.att.gob.bo/contactanos'
CITY_DEPT = {'La Paz': 'La Paz', 'La Paz - Teleférico Morado': 'La Paz', 'Cochabamba': 'Cochabamba',
             'Santa Cruz': 'Santa Cruz', 'Tarija': 'Tarija'}


def main(dl, out):
    retrieved = now_iso()
    html = decode(fetch(URL, os.path.join(dl, 'contactanos.html')))
    text = clean(re.sub(r'<script.*?</script>|<style.*?</style>', '', html, flags=re.S), 100000)
    block = text[text.find('Contactos') + len('Contactos'):text.find('Consultas generales')]
    rows = []
    for city, body in re.findall(r'(La Paz - Teleférico Morado|La Paz|Cochabamba|Santa Cruz|Tarija):\s*(.*?)(?=(?:La Paz - Teleférico Morado|La Paz|Cochabamba|Santa Cruz|Tarija):|$)', block):
        tel = re.search(r'Tel:\s*(.*)$', body)
        address = clean(body[:tel.start()] if tel else body).rstrip('.')
        rows.append(record(
            source='att_oficinas', source_id=city, name=f'ATT - Oficina {city}',
            category_raw='Oficina ATT (regulador de telecomunicaciones y transportes)', address=address,
            locality=None, municipality=None, department=CITY_DEPT.get(city), lat=None, lon=None,
            phone=clean(tel.group(1)) if tel else None, website=None, hours=None, source_updated_at=None,
            source_url=URL, retrieved_at=retrieved, raw={'ciudad': city, 'texto': clean(body)},
        ))
    print(json.dumps(write_source(out, 'att_oficinas', rows), ensure_ascii=False))


if __name__ == '__main__':
    main(sys.argv[1], sys.argv[2])
