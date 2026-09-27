"""Lectores y utilidades de las cargas de salud (`build_snis_health_poi_seed.py`, `build_agemed_pharmacies_seed.py`).

Aparte de los constructores para que cada uno quede en lo suyo: qué se carga y por qué.
Aquí solo se lee — el Access exportado a CSV, el shapefile del Ministerio, el KML del
mapa del SUS, las comunidades de OpenStreetMap y las siembras ya guardadas — y se mide.
"""

from __future__ import annotations

import collections
import csv
import json
import math
import re
import struct
import unicodedata
import xml.etree.ElementTree as ET
from collections.abc import Callable
from pathlib import Path

# El departamento, tal como lo nombra cada carpeta del mapa del SUS.
FOLDER_DEPARTMENT = {'La_Paz': 2, 'Potosi': 5, 'Santa_Cruz': 7, 'Cochabamba': 3, 'Chuquisaca': 1,
                     'Tarija': 6, 'Beni': 8, 'Oruro': 4, 'Pando': 9}
COMMUNITY_KINDS = {'village', 'hamlet', 'locality', 'isolated_dwelling', 'farm'}


def folded(text: object) -> str:
    plain = unicodedata.normalize('NFD', str(text or ''))
    plain = ''.join(c for c in plain if unicodedata.category(c) != 'Mn').upper()
    return re.sub(r'\s+', ' ', re.sub(r'[^A-Z0-9 ]', ' ', plain)).strip()


def metres(a: tuple[float, float], b: tuple[float, float]) -> float:
    lon1, lat1, lon2, lat2 = map(math.radians, (a[0], a[1], b[0], b[1]))
    h = math.sin((lat2 - lat1) / 2) ** 2 + math.cos(lat1) * math.cos(lat2) * math.sin((lon2 - lon1) / 2) ** 2
    return 2 * 6371000 * math.asin(math.sqrt(h))


def read_csv(path: Path) -> list[dict[str, str]]:
    with path.open(encoding='utf-8-sig', newline='') as handle:
        return [{k: (v or '').strip() for k, v in row.items()} for row in csv.DictReader(handle)]


def read_dbf(path: Path) -> list[dict[str, str]]:
    data = path.read_bytes()
    count, header, width = struct.unpack('<I', data[4:8])[0], *struct.unpack('<HH', data[8:12])
    fields, offset = [], 32
    while data[offset] != 0x0D:
        fields.append((data[offset:offset + 11].split(b'\0')[0].decode(), data[offset + 16]))
        offset += 32
    rows = []
    for index in range(count):
        record, cursor, row = data[header + index * width: header + (index + 1) * width], 1, {}
        for name, size in fields:
            row[name] = record[cursor:cursor + size].decode('latin1').strip()
            cursor += size
        rows.append(row)
    return rows


def read_shp_points(path: Path) -> list[tuple[float, float] | None]:
    data, cursor, points = path.read_bytes(), 100, []
    while cursor < len(data):
        _, length = struct.unpack('>ii', data[cursor:cursor + 8])
        kind = struct.unpack('<i', data[cursor + 8:cursor + 12])[0]
        points.append(struct.unpack('<dd', data[cursor + 12:cursor + 28]) if kind == 1 else None)
        cursor += 8 + length * 2
    return points


def read_sus_map(path: Path) -> list[dict]:
    ns = '{http://www.opengis.net/kml/2.2}'
    rows = []
    for folder in ET.parse(path).getroot().iter(f'{ns}Folder'):
        label = folder.findtext(f'{ns}name') or ''
        department = next((code for key, code in FOLDER_DEPARTMENT.items() if key in label), None)
        for mark in folder.findall(f'{ns}Placemark'):
            data = {d.get('name'): d.findtext(f'{ns}value') for d in mark.iter(f'{ns}Data')}
            lon, lat, *_ = (mark.findtext(f'.//{ns}coordinates') or '').strip().split(',')
            rows.append({'department': department, 'municipality': data.get('MUNICIPIO'),
                         'name': data.get('ESTABLECIEMIENTO') or mark.findtext(f'{ns}name'),
                         'class': data.get('CLASE'), 'point': (float(lon), float(lat))})
    return rows


def read_communities(pbf: Path) -> list[dict]:
    import osmium  # solo hace falta aquí

    class Places(osmium.SimpleHandler):
        def __init__(self) -> None:
            super().__init__()
            self.rows: list[dict] = []

        def node(self, node) -> None:
            kind, name = node.tags.get('place'), node.tags.get('name')
            if kind in COMMUNITY_KINDS and name:
                self.rows.append({'id': node.id, 'place': kind, 'name': name, 'alt': node.tags.get('alt_name'),
                                  'point': (node.location.lon, node.location.lat)})

    handler = Places()
    handler.apply_file(str(pbf))
    return handler.rows


def read_held(boot: Path, own: Path, wanted: Callable[[dict], bool]) -> list[dict]:
    """Los lugares de cualquier siembra `*-poi` salvo `own` que `wanted` acepta, con su punto."""
    held = []
    for directory in sorted(boot.glob('*-poi')):
        if directory.resolve() == own.resolve():
            continue
        for piece in sorted(directory.glob('*.json')):
            document = json.loads(piece.read_text('utf-8'))
            for place in document.get('places') or []:
                if wanted(place) and place.get('latitude') is not None:
                    held.append({'placeId': place['placeId'], 'name': place.get('name') or '',
                                 'publisher': place.get('publisher'), 'recordId': place.get('publisherRecordId'),
                                 'point': (float(place['longitude']), float(place['latitude']))})
    return held


class Grid:
    """Un índice por celdas de ~1 km para buscar vecinos sin recorrer todo el corpus."""

    def __init__(self, rows: list[dict], cell: float = 0.01) -> None:
        self.cell, self.cells = cell, collections.defaultdict(list)
        for row in rows:
            self.cells[self.key(row['point'])].append(row)

    def key(self, point: tuple[float, float]) -> tuple[int, int]:
        return int(math.floor(point[0] / self.cell)), int(math.floor(point[1] / self.cell))

    def near(self, point: tuple[float, float], radius_m: float) -> list[tuple[float, dict]]:
        reach = int(radius_m / (self.cell * 100000)) + 1
        x, y = self.key(point)
        found = []
        for dx in range(-reach, reach + 1):
            for dy in range(-reach, reach + 1):
                for row in self.cells.get((x + dx, y + dy), ()):
                    distance = metres(point, row['point'])
                    if distance <= radius_m:
                        found.append((distance, row))
        return sorted(found, key=lambda pair: pair[0])
