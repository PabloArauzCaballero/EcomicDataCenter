#!/usr/bin/env python3
"""Lee la red fluvial de Bolivia de un extracto de OpenStreetMap.

OpenStreetMap traza los rios pero casi nunca dice si se navegan: de 11.433
vias `waterway=river` en el extracto del 2026-09-26, 241 llevan `boat=yes`.
La navegabilidad se lee entonces de dos fuentes, y la ficha dice de cual:

- `HIDROVIA`: los rios de las hidrovias que el Ministerio de Obras Publicas,
  Servicios y Vivienda tiene en estudio y obra -Ichilo-Mamore (tramo I, mas de
  1.900 km por el Ichilo y el Mamore; tramo II, mas de 570 km por el Mamore y
  el Itenez) y Paraguay-Parana por el canal Tamengo-;
- `NAVEGABLE_EN_ESTUDIO`: los afluentes que el mismo ministerio nombra como
  navegables en estudio: Madre de Dios, Beni, Abuna, Madera, Tahuamanu y
  Orthon;
- `NAVEGABLE_OSM`: cualquier otro rio con `boat=yes` en OpenStreetMap;
- `RIO`: el resto, que se dibuja fino y no se cuenta como red navegable.

Los cruces en transbordador (`route=ferry`, sobre todo el estrecho de Tiquina
en el Titicaca) se leen aparte como `TRANSBORDADOR`, y los puertos y
terminales como puntos.
"""

from __future__ import annotations

import re
import sys
import unicodedata
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parents[1] / 'roads'))
from osm_lines import read_lines, read_points  # noqa: E402
from read_osm_roads import km_of, split_by_department  # noqa: E402
from read_osm_rail import department_at  # noqa: E402
from shapely.geometry import LineString  # noqa: E402

MINISTRY_SOURCE = 'https://eju.tv/2024/08/hidrovia-ichilo-mamore-avanza-hacia-la-integracion-fluvial-de-bolivia/'

# Palabra entera: «Beni» no es «Benicito» ni «Mamore» es «Mamorecillo».
HIDROVIA = re.compile(r'\b(ichilo|mamore|itenez|guapore|paraguay|tamengo)\b')
EN_ESTUDIO = re.compile(r'\b(madre de dios|beni|abuna|madera|tahuamanu|orthon)\b')
PORT = {
    ('amenity', 'ferry_terminal'): 'TERMINAL', ('industrial', 'port'): 'PUERTO',
    ('landuse', 'harbour'): 'PUERTO', ('landuse', 'port'): 'PUERTO',
    ('harbour', 'yes'): 'PUERTO', ('seamark:type', 'harbour'): 'PUERTO',
}


def plain(text: str) -> str:
    folded = unicodedata.normalize('NFD', text.lower())
    return ''.join(char for char in folded if unicodedata.category(char) != 'Mn')


def category_of(name: str | None, tags: dict[str, str]) -> str:
    folded = plain(name or '')
    if HIDROVIA.search(folded):
        return 'HIDROVIA'
    if EN_ESTUDIO.search(folded):
        return 'NAVEGABLE_EN_ESTUDIO'
    if (tags.get('boat') or '').startswith('yes') or tags.get('ship') == 'yes':
        return 'NAVEGABLE_OSM'
    return 'RIO'


def river_name(name: str | None) -> str | None:
    """«Rio Guapore (Brasil) / Rio Itenez (Bolivia)» se lee con su nombre boliviano."""
    if not name:
        return None
    if '/' in name and '(Bolivia)' in name:
        name = next(part for part in name.split('/') if '(Bolivia)' in part).replace('(Bolivia)', '')
    name = re.sub(r'^R[ií]o\b', 'Río', name.strip())
    return re.sub(r'\s+', ' ', name).strip()


def read_waterways(pbf_path: str, departments) -> list[dict]:
    def keep(_way_id: int, tags: dict[str, str]) -> bool:
        # El canal Tamengo es la salida de Puerto Quijarro al rio Paraguay: un canal, no un rio.
        tamengo = tags.get('waterway') == 'canal' and 'tamengo' in plain(tags.get('name') or '')
        return tags.get('waterway') == 'river' or tamengo or tags.get('route') == 'ferry'

    pieces = []
    for way_id, tags, coords in read_lines(pbf_path, keep):
        ferry = tags.get('route') == 'ferry'
        name = tags.get('name') if ferry else river_name(tags.get('name'))
        if ferry:
            # Una ruta de navegacion trazada como `route=ferry` («Hidrovia Ichilo-Mamore») es hidrovia.
            category = 'HIDROVIA' if 'hidrovia' in plain(name or '') else 'TRANSBORDADOR'
        else:
            category = category_of(name, tags)
        for department, piece in split_by_department(LineString(coords), departments):
            pieces.append({
                'wayId': way_id, 'name': name, 'category': category,
                'boat': tags.get('boat'), 'department': department,
                'geometry': piece, 'km': km_of(piece),
            })
    return pieces


def read_ports(pbf_path: str, departments) -> list[dict]:
    def kind_of(tags: dict[str, str]) -> str | None:
        return next((kind for (key, value), kind in PORT.items() if tags.get(key) == value), None)

    ports, seen = [], set()
    for kind, osm_id, tags, (lon, lat) in read_points(pbf_path, lambda tags: kind_of(tags) is not None):
        department = department_at(departments, lon, lat)
        if not department:
            continue
        name = (tags.get('name') or '').strip() or None
        key = ((name or '').lower(), round(lon, 2), round(lat, 2))
        if key in seen:
            continue
        seen.add(key)
        ports.append({
            'osmId': f'{kind}{osm_id}', 'name': name, 'kind': kind_of(tags),
            'department': department, 'lon': round(lon, 5), 'lat': round(lat, 5),
        })
    return ports
