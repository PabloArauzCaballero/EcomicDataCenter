"""ASFI: puntos de atencion financiera (refresco).

Uso: python -I asfi.py <json_descargado> <dir_salida> <retrieved_at>
Fuente: https://asfidigitalapi.asfi.gob.bo/api/v1/puntosAtencion/fecha/2009-07-01
La direccion, el telefono y el horario van dentro de `contenidoHTML`.
"""
import json
import re
import sys
import os

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
from common import clean, coords, department, record, write_source  # noqa: E402

URL = 'https://asfidigitalapi.asfi.gob.bo/api/v1/puntosAtencion/fecha/2009-07-01'


def field(html, label):
    m = re.search(r'<strong>\s*' + label + r'\s*:?\s*</strong>(.*?)(?:<br>\s*<strong>|</div>)', html, re.S | re.I)
    return clean(m.group(1)) if m else None


def main(path, out, retrieved):
    with open(path, encoding='utf-8') as fh:
        data = json.load(fh)
    rows = []
    for x in data['content']:
        html = x.get('contenidoHTML') or ''
        hours = re.search(r'Horarios de Atenci[oó]n:\s*</strong>(.*?)</div>', html, re.S)
        hours = clean(re.sub(r'<br\s*/?>', '; ', hours.group(1))).strip('; ') if hours else None
        lat, lon = coords(x.get('latitud'), x.get('longitud'))
        name = f"{x.get('entidad')} - {x.get('tdescripcion')}"
        rows.append(record(
            source='asfi_puntos_atencion', source_id=str(x['codigoPAF']), name=clean(name),
            category_raw=f"{x.get('desGrupo')} / {x.get('tdescripcion')}",
            address=field(html, 'Direccion') or field(html, 'Dirección'), locality=None, municipality=None,
            department=department(x.get('departamento')), lat=lat, lon=lon,
            phone=field(html, 'Teléfono') or field(html, 'Telefono'), website=None, hours=hours or None,
            source_updated_at=(x.get('fechaModificacion') or '').replace('.000+0000', 'Z') or None,
            source_url=URL, retrieved_at=retrieved, raw=x,
        ))
    stats = write_source(out, 'asfi_puntos_atencion', rows)
    stats['totalElements'] = data.get('totalElements')
    stats['max_fechaModificacion'] = max((x.get('fechaModificacion') or '') for x in data['content'])
    print(json.dumps(stats, ensure_ascii=False))


if __name__ == '__main__':
    main(sys.argv[1], sys.argv[2], sys.argv[3])
