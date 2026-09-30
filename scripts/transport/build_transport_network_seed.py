#!/usr/bin/env python3
"""Construye la siembra de la red ferroviaria y la red fluvial de Bolivia.

    python scripts/transport/build_transport_network_seed.py \\
      --pbf  bolivia-260926.osm.pbf --pbf-md5 <md5 que publica Geofabrik> \\
      --adm1 geoBoundaries-BOL-ADM1.geojson \\
      --ine-ferroviario ine-ferroviario-flujo.xlsx \\
      --retrieved-at 2026-09-27T22:26:00Z

Escribe tres archivos en `src/database/seeds/boot/bolivia-transport-network/`:

- `rail-network.json`: las lineas ferroviarias troncales de OpenStreetMap, una
  por red, linea, departamento y estado, y las estaciones con nombre;
- `rail-flows.json`: el flujo ferroviario del INE por red y servicio, anual y
  mensual, 1999 en adelante;
- `waterways.json`: los rios y cruces en transbordador de OpenStreetMap, uno
  por nombre, categoria de navegabilidad y departamento, y los puertos.

Mismo extracto, mismos limites y misma simplificacion que la red vial
(`scripts/roads`), para que las tres capas se superpongan sin correrse.
"""

from __future__ import annotations

import argparse
import hashlib
import json
import sys
from collections import Counter, defaultdict
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parents[1] / 'roads'))
from build_road_network_seed import digest, geometry_of, snapshot_of  # noqa: E402
from read_osm_roads import load_departments  # noqa: E402
from read_osm_rail import read_rail, read_stations  # noqa: E402
from read_osm_waterways import MINISTRY_SOURCE, plain, read_ports, read_waterways  # noqa: E402
from read_rail_flows import read_flows  # noqa: E402

ROOT = Path(__file__).resolve().parents[2]
OUT = ROOT / 'src' / 'database' / 'seeds' / 'boot' / 'bolivia-transport-network'
RAIL_FLOWS_URL = 'https://nube.ine.gob.bo/index.php/s/LoswDmbMeSpofJH/download'
RAIL_FLOWS_PAGE = 'https://www.ine.gob.bo/index.php/estadisticas-economicas/transportes/cuadros-estadisticos-t/'
BOUNDARIES = 'geoBoundaries gbOpen 9469f09 BOL ADM1 (GeoBolivia, dominio publico)'


def section_id(*parts: str) -> str:
    return hashlib.sha1('|'.join(parts).encode('utf-8')).hexdigest()[:16]


def rail_lines_of(pieces: list[dict]) -> list[dict]:
    groups: dict[tuple, list[dict]] = defaultdict(list)
    for piece in pieces:
        groups[(piece['network'], piece['line'] or '', piece['department'], piece['status'])].append(piece)
    lines = []
    for (network, line, department, status), members in sorted(groups.items()):
        operators = Counter(member['operator'] for member in members if member['operator'])
        gauges = Counter(member['gauge'] for member in members if member['gauge'])
        usages = Counter(member['usage'] for member in members if member['usage'])
        lines.append({
            'lineId': section_id('rail', network, line, department, status),
            'network': network, 'line': line or None, 'department': department, 'status': status,
            'operator': operators.most_common(1)[0][0] if operators else None,
            'gauge': gauges.most_common(1)[0][0] if gauges else None,
            'usage': usages.most_common(1)[0][0] if usages else None,
            'lengthKm': round(sum(member['km'] for member in members), 2),
            'wayCount': len(members),
            'geometry': geometry_of([member['geometry'] for member in members]),
        })
    return [line for line in lines if line['geometry']]


def waterways_of(pieces: list[dict]) -> list[dict]:
    # «Rio Mamore» y «Rio Mamoré» son el mismo rio: se agrupa sin tildes ni mayusculas
    # y se muestra el nombre que mas vias llevan.
    groups: dict[tuple, list[dict]] = defaultdict(list)
    for piece in pieces:
        groups[(piece['category'], plain(piece['name'] or ''), piece['department'])].append(piece)
    out = []
    for (category, _folded, department), members in sorted(groups.items()):
        names = Counter(member['name'] for member in members if member['name'])
        name = names.most_common(1)[0][0] if names else ''
        boat = sum(member['km'] for member in members if (member['boat'] or '').startswith('yes'))
        out.append({
            'waterwayId': section_id('water', category, name, department),
            'category': category, 'name': name or None, 'department': department,
            'lengthKm': round(sum(member['km'] for member in members), 2),
            'boatYesKm': round(boat, 2),
            'wayCount': len(members),
            'geometry': geometry_of([member['geometry'] for member in members]),
        })
    return [one for one in out if one['geometry']]


def osm_provenance(args, snapshot_date: str, extract_url: str, way_count: int) -> dict:
    return {
        'publisher': 'OpenStreetMap contributors',
        'licence': 'ODbL-1.0',
        'attribution': '© OpenStreetMap contributors, ODbL',
        'extractUri': extract_url,
        'extractSha256': digest(args.pbf, 'sha256'),
        'extractMd5': args.pbf_md5,
        'snapshotDate': snapshot_date,
        'retrievedAt': args.retrieved_at,
        'boundaries': BOUNDARIES,
        'boundariesSha256': digest(args.adm1, 'sha256'),
        'wayCount': way_count,
    }


def write(name: str, payload: dict) -> None:
    text = json.dumps(payload, ensure_ascii=False, separators=(',', ':'))
    (OUT / name).write_text(text + '\n', encoding='utf-8')
    print(f'{name}: {len(text.encode("utf-8")) / 1e6:.2f} MB')


def main() -> None:
    parser = argparse.ArgumentParser()
    for flag in ('pbf', 'pbf-md5', 'adm1', 'ine-ferroviario', 'retrieved-at'):
        parser.add_argument(f'--{flag}', required=True)
    args = parser.parse_args()
    snapshot_date, extract_url = snapshot_of(args.pbf)
    if digest(args.pbf, 'md5') != args.pbf_md5:
        raise SystemExit('El extracto no es el que Geofabrik publica: la huella MD5 no coincide.')
    departments = load_departments(args.adm1)
    OUT.mkdir(parents=True, exist_ok=True)

    rail = read_rail(args.pbf, departments)
    stations = read_stations(args.pbf, departments)
    rail_lines = rail_lines_of(rail)
    write('rail-network.json', {
        'dataset': 'bolivia-rail-network-osm',
        'provenance': osm_provenance(args, snapshot_date, extract_url, len(rail)),
        'lines': rail_lines,
        'stations': sorted(stations, key=lambda one: (one['department'], one['name'])),
    })

    flows = read_flows(args.ine_ferroviario, RAIL_FLOWS_URL, args.retrieved_at)
    write('rail-flows.json', {
        'dataset': 'bolivia-rail-flow-ine',
        'provenance': {
            'publisher': 'Instituto Nacional de Estadistica',
            'originator': 'Empresa Ferroviaria Andina y Empresa Ferroviaria Oriental',
            'pageUrl': RAIL_FLOWS_PAGE,
            'retrievedAt': args.retrieved_at,
        },
        'points': flows,
    })

    water = read_waterways(args.pbf, departments)
    ports = read_ports(args.pbf, departments)
    waterways = waterways_of(water)
    write('waterways.json', {
        'dataset': 'bolivia-waterways-osm',
        'provenance': {
            **osm_provenance(args, snapshot_date, extract_url, len(water)),
            'navigabilitySource': MINISTRY_SOURCE,
            'navigabilityPublisher': 'Ministerio de Obras Publicas, Servicios y Vivienda (via eju.tv, 2024-08-29)',
        },
        'waterways': waterways,
        'ports': sorted(ports, key=lambda one: (one['department'], one['name'] or '')),
    })

    by_network = Counter()
    for line in rail_lines:
        by_network[(line['network'], line['status'])] += line['lengthKm']
    by_category = Counter()
    for one in waterways:
        by_category[one['category']] += one['lengthKm']
    print('ferrocarril', {key: round(km) for key, km in sorted(by_network.items())}, len(stations), 'estaciones')
    print('flujo INE', len(flows), 'puntos')
    print('rios', {key: round(km) for key, km in by_category.items()}, len(ports), 'puertos')


if __name__ == '__main__':
    main()
