#!/usr/bin/env python3
"""Lee la red vial principal de Bolivia de un extracto de OpenStreetMap.

Se lee de un extracto `.osm.pbf` de Geofabrik y no de Overpass por una razon
medida el 2026-09-23: `overpass-api.de` rechazaba la conexion en el puerto 443 y
los dos espejos probados agotaban el tiempo sin responder. El extracto es el
mismo dato (el grafo de OpenStreetMap del dia anterior), se descarga entero,
trae su huella MD5 publicada y cualquiera puede volver a leerlo.

Devuelve una lista de vias con su geometria, sus etiquetas utiles y el
departamento en que cae cada pedazo. Una via que cruza un limite se corta en el
limite: asignarla entera por su punto medio atribuiria kilometros de Potosi a
Oruro, y el cruce con la cifra oficial es por departamento.
"""

from __future__ import annotations

import json
import math
import re

import osmium
from shapely import prepared
from shapely.geometry import LineString, MultiLineString, shape

# Las cuatro clases que en Bolivia marcan la red troncal y la departamental.
MAIN_CLASSES = ('motorway', 'trunk', 'primary', 'secondary')

# Codigo del registro por nombre de geoBoundaries, el mismo del mapa del tablero.
DEPARTMENT_CODE = {
    'Beni': 'BENI', 'Chuquisaca': 'CHUQUISACA', 'Cochabamba': 'COCHABAMBA',
    'La Paz': 'LA_PAZ', 'Oruro': 'ORURO', 'Pando': 'PANDO', 'Potosí': 'POTOSI',
    'Santa Cruz': 'SANTA_CRUZ', 'Tarija': 'TARIJA',
}

# Superficie de OpenStreetMap -> rodadura del INE. `unpaved` no dice si es ripio
# o tierra, y por eso tiene clase propia en vez de repartirse a ojo.
SURFACE_CLASS = {
    'asphalt': 'PAVIMENTO', 'paved': 'PAVIMENTO', 'concrete': 'PAVIMENTO',
    'concrete:plates': 'PAVIMENTO', 'concrete:lanes': 'PAVIMENTO', 'chipseal': 'PAVIMENTO',
    'paving_stones': 'EMPEDRADO', 'sett': 'EMPEDRADO', 'cobblestone': 'EMPEDRADO',
    'unhewn_cobblestone': 'EMPEDRADO', 'stone': 'EMPEDRADO',
    'gravel': 'RIPIO', 'fine_gravel': 'RIPIO', 'compacted': 'RIPIO', 'pebblestone': 'RIPIO',
    'dirt': 'TIERRA', 'earth': 'TIERRA', 'ground': 'TIERRA', 'sand': 'TIERRA', 'mud': 'TIERRA',
    'unpaved': 'SIN_PAVIMENTAR',
}

FUNDAMENTAL_REF = re.compile(r'^(?:F|RF|RN|RUTA|R)\s*-?\s*0*(\d{1,3})$', re.IGNORECASE)


def route_of(ref: str | None) -> tuple[str | None, list[str]]:
    """La ruta fundamental que nombra `ref`, si nombra una, y todas las que trae."""
    if not ref:
        return None, []
    refs = [part.strip() for part in re.split(r'[;,/]', ref) if part.strip()]
    for part in refs:
        match = FUNDAMENTAL_REF.match(part.replace('.', ''))
        if match:
            return f'F-{int(match.group(1))}', refs
    return None, refs


def surface_of(tags: dict[str, str]) -> str:
    return SURFACE_CLASS.get((tags.get('surface') or '').strip().lower(), 'SIN_DATO')


def load_departments(adm1_path: str) -> list[tuple[str, object, object]]:
    with open(adm1_path, encoding='utf-8') as handle:
        collection = json.load(handle)
    departments = []
    for feature in collection['features']:
        name = feature['properties']['shapeName']
        geometry = shape(feature['geometry']).buffer(0)
        departments.append((DEPARTMENT_CODE[name], geometry, prepared.prep(geometry)))
    return departments


def km_of(line: LineString) -> float:
    """Longitud geodesica, sumando tramos por haversine."""
    total = 0.0
    coords = list(line.coords)
    for (lon1, lat1), (lon2, lat2) in zip(coords, coords[1:]):
        phi1, phi2 = math.radians(lat1), math.radians(lat2)
        dphi, dlmb = phi2 - phi1, math.radians(lon2 - lon1)
        a = math.sin(dphi / 2) ** 2 + math.cos(phi1) * math.cos(phi2) * math.sin(dlmb / 2) ** 2
        total += 2 * 6371.0088 * math.asin(math.sqrt(a))
    return total


def lines_of(geometry) -> list[LineString]:
    if isinstance(geometry, LineString):
        return [geometry] if not geometry.is_empty else []
    if isinstance(geometry, MultiLineString):
        return [part for part in geometry.geoms if not part.is_empty]
    if hasattr(geometry, 'geoms'):
        return [part for sub in geometry.geoms for part in lines_of(sub)]
    return []


def split_by_department(line: LineString, departments) -> list[tuple[str, LineString]]:
    for code, geometry, fast in departments:
        if fast.contains(line):
            return [(code, line)]
    pieces = []
    for code, geometry, fast in departments:
        if fast.intersects(line):
            pieces.extend((code, part) for part in lines_of(line.intersection(geometry)))
    return pieces


def read_ways(pbf_path: str, departments) -> list[dict]:
    """Cada via principal, ya cortada por departamento."""
    ways = []
    processor = osmium.FileProcessor(pbf_path).with_locations().with_filter(
        osmium.filter.KeyFilter('highway'))
    for way in processor:
        if not isinstance(way, osmium.osm.Way):
            continue
        tags = {tag.k: tag.v for tag in way.tags}
        highway = tags.get('highway')
        status = 'EN_SERVICIO'
        if highway == 'construction' and tags.get('construction') in MAIN_CLASSES:
            highway, status = tags['construction'], 'EN_CONSTRUCCION'
        if highway not in MAIN_CLASSES:
            continue
        try:
            coords = [(node.lon, node.lat) for node in way.nodes]
        except osmium.InvalidLocationError:
            continue
        if len(coords) < 2:
            continue
        route, refs = route_of(tags.get('ref'))
        for department, piece in split_by_department(LineString(coords), departments):
            ways.append({
                'wayId': way.id, 'highway': highway, 'status': status,
                'route': route, 'refs': refs, 'name': tags.get('name'),
                'surface': surface_of(tags), 'rawSurface': tags.get('surface'),
                'maxspeed': tags.get('maxspeed'), 'department': department,
                # Una calzada de sentido unico es media via: la doble calzada se
                # dibuja como dos lineas y contarlas enteras duplicaria la ruta.
                'oneway': tags.get('oneway') in ('yes', '1', '-1'),
                'line': piece, 'km': km_of(piece),
            })
    return ways
