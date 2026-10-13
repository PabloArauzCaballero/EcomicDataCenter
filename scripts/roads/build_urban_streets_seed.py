#!/usr/bin/env python3
"""Construye la siembra de las calles urbanas de Bolivia, por celda.

    python scripts/roads/build_urban_streets_seed.py \
      --pbf  bolivia-260930.osm.pbf --pbf-md5 <md5 que publica Geofabrik> \
      --adm1 geoBoundaries-BOL-ADM1.geojson \
      --retrieved-at 2026-10-02T01:30:00Z

Escribe dos archivos en `src/database/seeds/boot/bolivia-road-network/`:

- `urban-streets.json`: las calles de las ciudades en celdas de 0,02 grados (~2,2 km),
  una celda por observacion, para que el tablero pida solo las que cruzan la pantalla.
- `urban-street-index.json`: por ciudad, cada nombre de calle con sus km, sus vias y la
  caja que lo contiene; es lo que busca el buscador sin bajar ninguna geometria.

Que entra: `residential`, `living_street`, `unclassified`, `service` (sin accesos a
parcela, aparcamientos ni salidas de emergencia) y `pedestrian` que caen en el radio
urbano de una ciudad o poblacion de OpenStreetMap. `tertiary` y superiores ya estan en
`road-sections.json`; repetirlas aqui las dibujaria dos veces.

Medido en el extracto del 2026-09-30: solo el 25 % de las calles residenciales tiene
nombre en OpenStreetMap. Las sin nombre se dibujan, pero no aparecen en el indice.
"""

from __future__ import annotations

import argparse
import hashlib
import json
import math
import re
from collections import defaultdict
from pathlib import Path

import numpy as np
import osmium
from shapely.geometry import LineString, Point

from read_osm_roads import km_of, load_departments, surface_of
from street_names import fold, resolve_name

ROOT = Path(__file__).resolve().parents[2]
OUT = ROOT / 'src' / 'database' / 'seeds' / 'boot' / 'bolivia-road-network'
EXTRACT_BASE = 'https://download.geofabrik.de/south-america/'

URBAN_CLASSES = ('residential', 'living_street', 'unclassified', 'service', 'pedestrian')
# Accesos privados que no son calle: no se dibujan ni se cuentan.
SERVICE_SKIP = ('driveway', 'parking_aisle', 'drive-through', 'emergency_access')
CELL_DEG = 0.02
# ~2 m a esta latitud: por debajo de un pixel al maximo acercamiento (x80 = ~130 m/px... y a x500, 20 m).
TOLERANCE_DEG = 0.00002
# Radio urbano, en km: lo que cubre la mancha de una ciudad grande, una ciudad y una poblacion.
RADIUS_KM = {'metropolis': 20.0, 'city': 12.0, 'town': 5.0}
METROPOLIS = {'Santa Cruz de la Sierra', 'El Alto', 'La Paz', 'Cochabamba'}
SURFACE_CODE = {
    'PAVIMENTO': 'P', 'EMPEDRADO': 'E', 'RIPIO': 'R', 'TIERRA': 'T', 'SIN_PAVIMENTAR': 'U', 'SIN_DATO': 'D',
}
CLASS_CODE = {'residential': 'r', 'living_street': 'l', 'unclassified': 'u', 'service': 's', 'pedestrian': 'p'}


def snapshot_of(pbf: str) -> tuple[str, str]:
    name = Path(pbf).name
    match = re.fullmatch(r'bolivia-(\d{2})(\d{2})(\d{2})\.osm\.pbf', name)
    if not match:
        raise SystemExit(f'{name}: el extracto debe llamarse bolivia-AAMMDD.osm.pbf, como lo publica Geofabrik.')
    year, month, day = match.groups()
    return f'20{year}-{month}-{day}', EXTRACT_BASE + name


def digest(path: str, algorithm: str) -> str:
    hasher = hashlib.new(algorithm)
    with open(path, 'rb') as handle:
        for block in iter(lambda: handle.read(1 << 20), b''):
            hasher.update(block)
    return hasher.hexdigest()


def read_places(pbf: str) -> list[dict]:
    """Las ciudades y poblaciones de OpenStreetMap, con su radio urbano."""
    nodes = osmium.FileProcessor(pbf).with_filter(osmium.filter.EntityFilter(osmium.osm.NODE)).with_filter(
        osmium.filter.TagFilter(('place', 'city'), ('place', 'town'))
    )
    places = []
    for node in nodes:
        tags = {tag.k: tag.v for tag in node.tags}
        name = tags.get('name')
        if not name or not node.location.valid():
            continue
        kind = 'metropolis' if name in METROPOLIS else tags['place']
        places.append({
            'name': name, 'kind': kind, 'lon': node.location.lon, 'lat': node.location.lat,
            'radius': RADIUS_KM[kind],
        })
    return places


def nearest_place(lon: float, lat: float, places: list[dict], lons, lats, radii):
    """La poblacion cuyo radio contiene el punto (la mas cercana si son varias), o None."""
    dx = (lons - lon) * math.cos(math.radians(lat)) * 111.19
    dy = (lats - lat) * 111.19
    distance = np.hypot(dx, dy)
    inside = np.where(distance < radii)[0]
    if not inside.size:
        return None
    return places[int(inside[np.argmin(distance[inside])])]


def read_streets(pbf: str, places: list[dict]) -> list[dict]:
    """Cada calle urbana con su geometria fina, su nombre y la ciudad que la contiene."""
    lons = np.array([place['lon'] for place in places])
    lats = np.array([place['lat'] for place in places])
    radii = np.array([place['radius'] for place in places])
    streets = []
    index = '/tmp/streets.nodes'
    processor = (
        osmium.FileProcessor(pbf)
        .with_locations(f'sparse_file_array,{index}')
        .with_filter(osmium.filter.EntityFilter(osmium.osm.WAY))
    )
    for way in processor:
        tags = {tag.k: tag.v for tag in way.tags}
        highway = tags.get('highway')
        if highway not in URBAN_CLASSES:
            continue
        if highway == 'service' and tags.get('service') in SERVICE_SKIP:
            continue
        coords = [(node.lon, node.lat) for node in (n.location for n in way.nodes) if node.valid()]
        if len(coords) < 2:
            continue
        line = LineString(coords)
        mid = line.interpolate(0.5, normalized=True)
        place = nearest_place(mid.x, mid.y, places, lons, lats, radii)
        if place is None:
            continue
        name, source = resolve_name(tags)
        streets.append({
            'wayId': way.id, 'highway': highway, 'name': name, 'nameSource': source,
            'surface': surface_of(tags), 'line': line, 'mid': (mid.x, mid.y), 'city': place['name'],
        })
    return streets


def simplified(line: LineString) -> list[list[float]]:
    out: list[list[float]] = []
    for lon, lat in line.simplify(TOLERANCE_DEG, preserve_topology=False).coords:
        point = [round(lon, 5), round(lat, 5)]
        if not out or out[-1] != point:
            out.append(point)
    return out


def cell_key(lon: float, lat: float) -> str:
    return f'{math.floor(lat / CELL_DEG) * CELL_DEG:.2f}:{math.floor(lon / CELL_DEG) * CELL_DEG:.2f}'


def department_of(lon: float, lat: float, departments) -> str | None:
    point = Point(lon, lat)
    for code, _geometry, fast in departments:
        if fast.contains(point):
            return code
    return None


def build(streets: list[dict], departments) -> tuple[list[dict], list[dict]]:
    cells: dict[str, list[dict]] = defaultdict(list)
    index: dict[tuple[str, str], dict] = {}
    for street in sorted(streets, key=lambda item: item['wayId']):
        geometry = simplified(street['line'])
        if len(geometry) < 2:
            continue
        length = km_of(LineString(geometry))
        minx, miny, maxx, maxy = street['line'].bounds
        cells[cell_key(*street['mid'])].append({
            'id': street['wayId'], 'name': street['name'], 'class': CLASS_CODE[street['highway']],
            'surface': SURFACE_CODE[street['surface']], 'km': round(length, 3), 'line': geometry,
            'bounds': [minx, miny, maxx, maxy],
        })
        if street['name']:
            entry = index.setdefault((street['city'], fold(street['name'])), {
                'name': street['name'], 'key': fold(street['name']), 'city': street['city'],
                'km': 0.0, 'ways': 0, 'paved': 0.0, 'bounds': [minx, miny, maxx, maxy],
                'department': department_of(*street['mid'], departments),
            })
            entry['km'] += length
            entry['ways'] += 1
            if street['surface'] == 'PAVIMENTO':
                entry['paved'] += length
            box = entry['bounds']
            box[0], box[1], box[2], box[3] = min(box[0], minx), min(box[1], miny), max(box[2], maxx), max(box[3], maxy)
    out_cells = []
    for key in sorted(cells):
        ways = cells[key]
        lat0, lon0 = (float(part) for part in key.split(':'))
        mx = (lon0 + CELL_DEG / 2, lat0 + CELL_DEG / 2)
        box = [min(w['bounds'][0] for w in ways), min(w['bounds'][1] for w in ways),
               max(w['bounds'][2] for w in ways), max(w['bounds'][3] for w in ways)]
        out_cells.append({
            'cellId': key,
            'department': department_of(mx[0], mx[1], departments),
            'bounds': [round(value, 5) for value in box],
            'streets': [
                {k: v for k, v in way.items() if k != 'bounds'} for way in ways
            ],
        })
    out_index = [
        {**{k: v for k, v in entry.items() if k not in ('km', 'paved', 'bounds')},
         'km': round(entry['km'], 2), 'paved': round(entry['paved'], 2),
         'bounds': [round(value, 5) for value in entry['bounds']]}
        for _key, entry in sorted(index.items())
    ]
    return out_cells, out_index


def main() -> None:
    parser = argparse.ArgumentParser()
    for flag in ('pbf', 'pbf-md5', 'adm1', 'retrieved-at'):
        parser.add_argument(f'--{flag}', required=True)
    args = parser.parse_args()
    snapshot_date, extract_url = snapshot_of(args.pbf)
    if digest(args.pbf, 'md5') != args.pbf_md5:
        raise SystemExit('El extracto no es el que Geofabrik publica: la huella MD5 no coincide.')
    departments = load_departments(args.adm1)

    places = read_places(args.pbf)
    streets = read_streets(args.pbf, places)
    cells, index = build(streets, departments)

    provenance = {
        'publisher': 'OpenStreetMap contributors',
        'licence': 'ODbL-1.0',
        'attribution': '© OpenStreetMap contributors, ODbL',
        'extractUri': extract_url,
        'extractSha256': digest(args.pbf, 'sha256'),
        'extractMd5': args.pbf_md5,
        'snapshotDate': snapshot_date,
        'retrievedAt': args.retrieved_at,
        'boundaries': 'geoBoundaries gbOpen 9469f09 BOL ADM1 (GeoBolivia, dominio publico)',
        'boundariesSha256': digest(args.adm1, 'sha256'),
        'highwayClasses': list(URBAN_CLASSES),
        'simplificationToleranceDeg': TOLERANCE_DEG,
        'wayCount': len(streets),
    }
    OUT.mkdir(parents=True, exist_ok=True)
    outputs = [
        ('urban-streets.json', {
            'dataset': 'bolivia-urban-streets-osm', 'provenance': {**provenance, 'cellDeg': CELL_DEG}, 'cells': cells,
        }),
        ('urban-street-index.json', {
            'dataset': 'bolivia-urban-street-index-osm', 'provenance': provenance, 'streets': index,
        }),
    ]
    for name, payload in outputs:
        text = json.dumps(payload, ensure_ascii=False, separators=(',', ':'))
        (OUT / name).write_text(text + '\n', encoding='utf-8')
        print(f'{name}: {len(text.encode("utf-8")) / 1e6:.2f} MB')
    named = sum(1 for street in streets if street['name'])
    print(f'{len(places)} poblaciones, {len(streets)} calles ({named} con nombre), {len(cells)} celdas, {len(index)} nombres')


if __name__ == '__main__':
    main()
