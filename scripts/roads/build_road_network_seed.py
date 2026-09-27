#!/usr/bin/env python3
"""Construye la siembra de la red vial de Bolivia.

    python scripts/roads/build_road_network_seed.py \
      --pbf  bolivia-260922.osm.pbf --pbf-md5 <md5 que publica Geofabrik> \
      --adm1 geoBoundaries-BOL-ADM1.geojson \
      --ine-red-rodadura ine-red-rodadura.xlsx \
      --ine-depto-rodadura ine-depto-rodadura.xlsx \
      --ine-depto-red ine-depto-red.xlsx \
      --retrieved-at 2026-09-23T11:30:00Z

Escribe dos archivos en `src/database/seeds/boot/bolivia-road-network/`:

- `road-sections.json`: los tramos de la red principal que cartografia
  OpenStreetMap, uno por ruta, departamento, rodadura y estado, con su
  geometria simplificada (Douglas-Peucker, ~200 m).
- `road-lengths.json`: la longitud oficial de caminos 2000-2024 del INE.

Un tramo aqui no es el tramo administrativo de la ABC, que no se pudo
descargar: es el pedazo de una ruta que comparte departamento, rodadura y
estado. Por eso se llama «tramo» en el tablero y se explica alli.
"""

from __future__ import annotations

import argparse
import hashlib
import json
from collections import Counter, defaultdict
from pathlib import Path

from shapely.geometry import MultiLineString
from shapely.ops import linemerge

from read_official_lengths import read_lengths
from read_osm_roads import load_departments, read_ways

ROOT = Path(__file__).resolve().parents[2]
OUT = ROOT / 'src' / 'database' / 'seeds' / 'boot' / 'bolivia-road-network'
# ~200 m a la latitud de Bolivia: por debajo de un pixel del mapa del tablero.
TOLERANCE_DEG = 0.0018
CLASS_RANK = {'motorway': 4, 'trunk': 3, 'primary': 2, 'secondary': 1}
INE = 'https://nube.ine.gob.bo/index.php/s/'
EXTRACT_URL = 'https://download.geofabrik.de/south-america/bolivia-260922.osm.pbf'


def digest(path: str, algorithm: str) -> str:
    hasher = hashlib.new(algorithm)
    with open(path, 'rb') as handle:
        for block in iter(lambda: handle.read(1 << 20), b''):
            hasher.update(block)
    return hasher.hexdigest()


def network_of(way: dict) -> tuple[str, str | None]:
    """Red y referencia: F-n es fundamental, Dnnn departamental, el resto sin referencia."""
    if way['route']:
        return 'FUNDAMENTAL', way['route']
    departmental = next((ref for ref in way['refs'] if ref[:1] == 'D' and ref[1:].isdigit()), None)
    if departmental:
        return 'DEPARTAMENTAL', departmental
    return 'SIN_REFERENCIA', None


def geometry_of(lines) -> list[list[list[float]]]:
    merged = linemerge(MultiLineString(lines))
    parts = list(merged.geoms) if hasattr(merged, 'geoms') else [merged]
    out = []
    for part in parts:
        coords = []
        for lon, lat in part.simplify(TOLERANCE_DEG, preserve_topology=False).coords:
            point = [round(lon, 4), round(lat, 4)]
            if not coords or coords[-1] != point:
                coords.append(point)
        if len(coords) >= 2:
            out.append(coords)
    return out


def sections_of(ways: list[dict]) -> list[dict]:
    groups: dict[tuple, list[dict]] = defaultdict(list)
    for way in ways:
        network, ref = network_of(way)
        # Sin referencia se agrupa por nombre; sin nombre, por clase.
        label = ref or way['name'] or f"({way['highway']})"
        groups[(network, label, way['department'], way['surface'], way['status'])].append(way)
    sections = []
    for (network, label, department, surface, status), members in sorted(groups.items()):
        names = Counter(way['name'] for way in members if way['name'])
        speeds = Counter(way['maxspeed'] for way in members if way['maxspeed'])
        highway = max((way['highway'] for way in members), key=CLASS_RANK.get)
        centreline = sum(way['km'] * (0.5 if way['oneway'] else 1) for way in members)
        key = f'{network}|{label}|{department}|{surface}|{status}'
        sections.append({
            'sectionId': hashlib.sha1(key.encode('utf-8')).hexdigest()[:16],
            'route': label if network != 'SIN_REFERENCIA' else None,
            'network': network,
            'name': names.most_common(1)[0][0] if names else None,
            'department': department,
            'highwayClass': highway,
            'surface': surface,
            'status': status,
            'lengthKm': round(centreline, 2),
            'carriagewayKm': round(sum(way['km'] for way in members), 2),
            'maxspeed': speeds.most_common(1)[0][0] if speeds else None,
            'wayCount': len(members),
            'geometry': geometry_of([way['line'] for way in members]),
        })
    return sections


def main() -> None:
    parser = argparse.ArgumentParser()
    for flag in ('pbf', 'pbf-md5', 'adm1', 'ine-red-rodadura', 'ine-depto-rodadura',
                 'ine-depto-red', 'retrieved-at'):
        parser.add_argument(f'--{flag}', required=True)
    args = parser.parse_args()
    if digest(args.pbf, 'md5') != args.pbf_md5:
        raise SystemExit('El extracto no es el que Geofabrik publica: la huella MD5 no coincide.')

    ways = read_ways(args.pbf, load_departments(args.adm1))
    sections = sections_of(ways)
    OUT.mkdir(parents=True, exist_ok=True)
    road_sections = {
        'dataset': 'bolivia-road-network-osm',
        'provenance': {
            'publisher': 'OpenStreetMap contributors',
            'licence': 'ODbL-1.0',
            'attribution': '© OpenStreetMap contributors, ODbL',
            'extractUri': EXTRACT_URL,
            'extractSha256': digest(args.pbf, 'sha256'),
            'extractMd5': args.pbf_md5,
            'snapshotDate': '2026-09-22',
            'retrievedAt': args.retrieved_at,
            'boundaries': 'geoBoundaries gbOpen 9469f09 BOL ADM1 (GeoBolivia, dominio publico)',
            'boundariesSha256': digest(args.adm1, 'sha256'),
            'highwayClasses': sorted(CLASS_RANK, key=CLASS_RANK.get, reverse=True),
            'simplificationToleranceDeg': TOLERANCE_DEG,
            'wayCount': len(ways),
        },
        'sections': sections,
    }
    lengths = {
        'dataset': 'bolivia-road-length-ine',
        'provenance': {
            'publisher': 'Instituto Nacional de Estadistica',
            'originator': 'Administradora Boliviana de Carreteras y Servicios Departamentales de Caminos',
            'coverage': 'Red Fundamental y Red Departamental; no incluye la red municipal',
            'pageUrl': 'https://www.ine.gob.bo/index.php/estadisticas-economicas/transportes/longitud-de-caminos-cuadros-estadisticos/',
            'retrievedAt': args.retrieved_at,
        },
        'points': read_lengths([
            (args.ine_red_rodadura, 'network-surface', INE + 'wgeKhjEWYPwYpA3/download'),
            (args.ine_depto_rodadura, 'department-surface', INE + 'kkxKVTgxWySZp71/download'),
            (args.ine_depto_red, 'department-network', INE + '6LJuA7a7zc9Xla4/download'),
        ], args.retrieved_at),
    }
    for name, payload in (('road-sections.json', road_sections), ('road-lengths.json', lengths)):
        text = json.dumps(payload, ensure_ascii=False, separators=(',', ':'))
        (OUT / name).write_text(text + '\n', encoding='utf-8')
        print(f'{name}: {len(text.encode("utf-8")) / 1e6:.2f} MB')
    print(f'{len(ways)} vias, {len(sections)} tramos, {len(lengths["points"])} puntos del INE')


if __name__ == '__main__':
    main()
