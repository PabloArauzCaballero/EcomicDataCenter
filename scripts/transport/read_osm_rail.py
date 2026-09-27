#!/usr/bin/env python3
"""Lee la red ferroviaria de Bolivia de un extracto de OpenStreetMap.

Bolivia tiene dos redes de trocha metrica que no se tocan -la Andina, del
altiplano a Chile, Argentina y Peru, y la Oriental, de Santa Cruz a Brasil y
Argentina- y el tren metropolitano de Cochabamba, de trocha estandar. El INE
publica su trafico por esas dos redes, asi que cada via se asigna a una:

1. `light_rail` es el metropolitano de Cochabamba (unico en el pais);
2. si el operador lo dice (Ferroviaria Oriental/FO/FCO o Ferroviaria
   Andina/FCA/FCAB...), manda el operador; ENFE no, porque opero las dos;
3. si no, la longitud: las dos redes estan separadas por la cordillera, y
   ninguna via de la Andina pasa al este de 64,6 grados oeste (Aiquile, la
   punta oriental, esta en 65,2) ni ninguna de la Oriental al oeste (Bulo
   Bulo, la occidental, en 64,4).

Solo la via troncal: los desvios, patios y ramales de servicio (`service` =
yard, siding, spur, crossover) se dejan fuera, como hace cualquier cifra de
longitud de red; sumarlos contaria dos veces la misma estacion.
"""

from __future__ import annotations

import re
import sys
from pathlib import Path

import osmium

sys.path.insert(0, str(Path(__file__).resolve().parents[1] / 'roads'))
from osm_lines import read_lines, read_points  # noqa: E402
from read_osm_roads import km_of, split_by_department  # noqa: E402
from shapely.geometry import LineString, Point  # noqa: E402

LINE_KINDS = {
    'rail': 'EN_SERVICIO', 'narrow_gauge': 'EN_SERVICIO', 'light_rail': 'EN_SERVICIO',
    'preserved': 'EN_SERVICIO', 'construction': 'EN_CONSTRUCCION',
    'disused': 'EN_DESUSO', 'abandoned': 'ABANDONADA',
}
SERVICE_TRACKS = ('yard', 'siding', 'spur', 'crossover')
ORIENTAL = re.compile(r'oriental|^fo$|^fco$', re.IGNORECASE)
# ENFE no decide: fue la empresa estatal de las dos redes hasta 1996.
ANDINA = re.compile(r'andina|^fca$|fcab|arica|antofagasta', re.IGNORECASE)
EAST_OF = -64.6


def network_of(railway: str, operator: str | None, lon: float) -> str:
    if railway == 'light_rail':
        return 'METROPOLITANA'
    if operator and ORIENTAL.search(operator.strip()):
        return 'ORIENTAL'
    if operator and ANDINA.search(operator.strip()):
        return 'ANDINA'
    return 'ORIENTAL' if lon > EAST_OF else 'ANDINA'


def read_line_names(pbf_path: str) -> dict[int, str]:
    """Via -> nombre de la linea, de las relaciones `route=railway|light_rail|tracks`."""
    names: dict[int, str] = {}
    processor = osmium.FileProcessor(pbf_path).with_filter(osmium.filter.EntityFilter(osmium.osm.RELATION))
    for relation in processor:
        tags = relation.tags
        if tags.get('type') != 'route' or tags.get('route') not in ('railway', 'tracks'):
            continue
        name = tags.get('name')
        if not name:
            continue
        for member in relation.members:
            if member.type == 'w':
                names.setdefault(member.ref, name)
    return names


def read_rail(pbf_path: str, departments) -> list[dict]:
    """Cada via troncal, cortada por departamento, con su red, linea y estado."""
    line_names = read_line_names(pbf_path)

    def keep(_way_id: int, tags: dict[str, str]) -> bool:
        return tags.get('railway') in LINE_KINDS and tags.get('service') not in SERVICE_TRACKS

    pieces = []
    for way_id, tags, coords in read_lines(pbf_path, keep):
        railway = tags['railway']
        status = LINE_KINDS[railway]
        if status == 'EN_SERVICIO' and tags.get('disused') == 'yes':
            status = 'EN_DESUSO'
        mean_lon = sum(lon for lon, _ in coords) / len(coords)
        network = network_of(railway, tags.get('operator'), mean_lon)
        for department, piece in split_by_department(LineString(coords), departments):
            pieces.append({
                'wayId': way_id, 'railway': railway, 'status': status, 'network': network,
                'line': line_names.get(way_id) or tags.get('name'),
                'operator': tags.get('operator'), 'gauge': tags.get('gauge'),
                'usage': tags.get('usage') or ('tourism' if railway == 'preserved' else None),
                'department': department, 'geometry': piece, 'km': km_of(piece),
            })
    return pieces


def department_at(departments, lon: float, lat: float) -> str | None:
    point = Point(lon, lat)
    for code, _geometry, fast in departments:
        if fast.contains(point):
            return code
    return None


def read_stations(pbf_path: str, departments) -> list[dict]:
    """Estaciones y apeaderos con nombre, dentro del pais."""
    def keep(tags: dict[str, str]) -> bool:
        return tags.get('railway') in ('station', 'halt') and bool(tags.get('name'))

    stations, seen = [], set()
    for kind, osm_id, tags, (lon, lat) in read_points(pbf_path, keep):
        department = department_at(departments, lon, lat)
        key = (tags['name'].strip().lower(), round(lon, 2), round(lat, 2))
        if not department or key in seen:
            continue
        seen.add(key)
        light = tags.get('station') == 'light_rail' or tags.get('light_rail') == 'yes'
        stations.append({
            'osmId': f'{kind}{osm_id}', 'name': tags['name'].strip(),
            'kind': 'APEADERO' if tags['railway'] == 'halt' else 'ESTACION',
            'network': 'METROPOLITANA' if light else network_of('rail', tags.get('operator'), lon),
            'department': department, 'lon': round(lon, 5), 'lat': round(lat, 5),
        })
    return stations
