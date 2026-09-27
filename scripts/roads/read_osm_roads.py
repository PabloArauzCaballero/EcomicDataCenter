#!/usr/bin/env python3
"""Lee la red vial de Bolivia de un extracto de OpenStreetMap.

Se lee de un extracto `.osm.pbf` de Geofabrik y no de Overpass por una razon
medida el 2026-09-23: `overpass-api.de` rechazaba la conexion en el puerto 443 y
los dos espejos probados agotaban el tiempo sin responder. El extracto es el
mismo dato (el grafo de OpenStreetMap del dia anterior), se descarga entero,
trae su huella MD5 publicada y cualquiera puede volver a leerlo.

Devuelve una lista de vias con su geometria, sus etiquetas utiles y el
departamento en que cae cada pedazo. Una via que cruza un limite se corta en el
limite: asignarla entera por su punto medio atribuiria kilometros de Potosi a
Oruro, y el cruce con la cifra oficial es por departamento.

La primera lectura (2026-09-23) tomaba solo motorway, trunk, primary y
secondary, y con eso dejaba fuera casi toda la Red Departamental: en Bolivia
los mapeadores etiquetan una ruta «D4105» como `tertiary` (1.723 vias con
codigo D lo son) y muchas veces le ponen el codigo solo a la relacion de ruta
y no a la via. El resultado eran 1.271 km departamentales contra los 36.577
que cuenta el INE. Esta lectura suma tres cosas:

- la clase `tertiary`, donde vive la Red Departamental;
- las relaciones de ruta `BO:fundamental` y `BO:departamental:*`, cuyo codigo
  pasa a las vias miembro que no lo traen;
- cualquier via de clase menor (`unclassified`, `track`...) que lleve un
  codigo F o D propio o por su relacion: una ruta oficial mapeada como pista
  sigue siendo esa ruta.
"""

from __future__ import annotations

import json
import math
import re

import osmium
from shapely import prepared
from shapely.geometry import LineString, MultiLineString, shape

from osm_lines import read_lines

# Las clases que se leen siempre, lleven o no codigo de ruta.
MAIN_CLASSES = ('motorway', 'trunk', 'primary', 'secondary', 'tertiary')
# Las que se leen solo si llevan un codigo F o D (propio o de su relacion).
MINOR_CLASSES = ('unclassified', 'track', 'residential', 'service', 'road', 'living_street')

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

FUNDAMENTAL_REF = re.compile(r'^(?:F|RF|RUTA|R)\s*-?\s*0*(\d{1,3})$', re.IGNORECASE)
# D4105, D625a, D01SU04: el codigo departamental se guarda tal cual, con su D.
DEPARTMENTAL_REF = re.compile(r'^D\s*-?\s*(\d{1,4}[A-Za-z0-9]*)$')
DEPARTMENTAL_NAME = re.compile(r'^Ruta Departamental\b', re.IGNORECASE)


def fundamental_of(part: str) -> str | None:
    match = FUNDAMENTAL_REF.match(part.replace('.', '').strip())
    return f'F-{int(match.group(1))}' if match else None


def departmental_of(part: str) -> str | None:
    match = DEPARTMENTAL_REF.match(part.strip())
    return f'D{match.group(1)}' if match else None


def split_refs(ref: str | None) -> list[str]:
    return [part.strip() for part in re.split(r'[;,/]', ref or '') if part.strip()]


def route_of(refs: list[str]) -> tuple[str, str] | None:
    """La red y el codigo que nombra una lista de referencias: F antes que D."""
    for part in refs:
        fundamental = fundamental_of(part)
        if fundamental:
            return 'FUNDAMENTAL', fundamental
    for part in refs:
        departmental = departmental_of(part)
        if departmental:
            return 'DEPARTAMENTAL', departmental
    return None


def relation_route(tags) -> tuple[str, str] | None:
    """El codigo que una relacion de ruta boliviana da a sus vias."""
    network = tags.get('network') or ''
    ref = (tags.get('ref') or '').strip()
    if not network.startswith('BO') or not ref:
        return None
    if network == 'BO:fundamental':
        fundamental = fundamental_of(ref) or fundamental_of(f'F{ref}')
        return ('FUNDAMENTAL', fundamental) if fundamental else None
    departmental = network.startswith('BO:departamental') or DEPARTMENTAL_NAME.match(tags.get('name') or '')
    if departmental:
        code = departmental_of(ref) or departmental_of(f'D{ref}')
        return ('DEPARTAMENTAL', code) if code else None
    return None


def read_route_relations(pbf_path: str) -> dict[int, tuple[str, str]]:
    """Via -> (red, codigo) de las relaciones de ruta; la Fundamental manda."""
    member_route: dict[int, tuple[str, str]] = {}
    processor = osmium.FileProcessor(pbf_path).with_filter(osmium.filter.EntityFilter(osmium.osm.RELATION))
    for relation in processor:
        tags = relation.tags
        if tags.get('type') != 'route' or tags.get('route') != 'road':
            continue
        route = relation_route(tags)
        if not route:
            continue
        for member in relation.members:
            if member.type != 'w':
                continue
            held = member_route.get(member.ref)
            if held is None or (held[0] == 'DEPARTAMENTAL' and route[0] == 'FUNDAMENTAL'):
                member_route[member.ref] = route
    return member_route


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


def pick_route(own, related):
    """El codigo propio de la via manda, salvo que la relacion la haga Fundamental."""
    if own and related and related[0] == 'FUNDAMENTAL' and own[0] != 'FUNDAMENTAL':
        return related
    return own or related


def read_ways(pbf_path: str, departments) -> list[dict]:
    """Cada via de la red, ya cortada por departamento y con su ruta resuelta."""
    member_route = read_route_relations(pbf_path)

    def resolved(way_id: int, tags: dict[str, str]):
        highway = tags.get('highway')
        status = 'EN_SERVICIO'
        if highway == 'construction':
            highway, status = tags.get('construction') or 'road', 'EN_CONSTRUCCION'
        route = pick_route(route_of(split_refs(tags.get('ref'))), member_route.get(way_id))
        if highway not in MAIN_CLASSES and not (route and highway in MINOR_CLASSES):
            return None
        return highway, status, route

    ways = []
    for way_id, tags, coords in read_lines(pbf_path, lambda way_id, tags: resolved(way_id, tags) is not None):
        highway, status, route = resolved(way_id, tags)
        for department, piece in split_by_department(LineString(coords), departments):
            ways.append({
                'wayId': way_id, 'highway': highway, 'status': status,
                'network': route[0] if route else 'SIN_REFERENCIA',
                'route': route[1] if route else None,
                'name': tags.get('name'),
                'surface': surface_of(tags), 'rawSurface': tags.get('surface'),
                'maxspeed': tags.get('maxspeed'), 'department': department,
                # Una calzada de sentido unico es media via: la doble calzada se
                # dibuja como dos lineas y contarlas enteras duplicaria la ruta.
                'oneway': tags.get('oneway') in ('yes', '1', '-1'),
                'line': piece, 'km': km_of(piece),
            })
    return ways
