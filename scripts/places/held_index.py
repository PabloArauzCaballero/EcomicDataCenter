"""El índice de lo que el corpus ya guarda, para las cargas del 2026-10-27 en adelante.

Las cargas anteriores leían todas las siembras en memoria a la vez (`read_held`). Con
más de 190.000 lugares en disco y la laptop justa de RAM, aquí se leen una pieza por
vez y se guarda solo lo que hace falta para cruzar: identificador, identificador del
publicador, nombre plegado, punto y familia.

El corpus de tres ciudades (`bolivia-poi`) guarda el id de Overture sin prefijo; se
normaliza a `overture:<id>` para que el cruce por identificador lo vea.
"""

from __future__ import annotations

import collections
import json
import math
from collections.abc import Iterable
from pathlib import Path

from health_sources import folded, metres

STOP = {'DE', 'DEL', 'LA', 'EL', 'LOS', 'LAS', 'Y', 'SUCURSAL', 'SUC', 'BOLIVIA', 'BOLIVIANA', 'BOLIVIANO',
        'SRL', 'S', 'A', 'SA', 'LTDA', 'R', 'L'}


def tokens(name: str) -> frozenset[str]:
    return frozenset(t for t in folded(name).split() if t not in STOP and len(t) > 1)


class Held:
    """Los lugares guardados, con un índice por celdas de ~200 m."""

    CELL = 0.002

    def __init__(self) -> None:
        self.ids: dict[str, str] = {}  # placeId normalizado -> familia
        self.cells: dict[tuple[int, int], list[tuple]] = collections.defaultdict(list)
        self.count = 0

    @staticmethod
    def normal_id(place_id: str, directory: str) -> str:
        if directory == 'bolivia-poi' and ':' not in place_id:
            return f'overture:{place_id}'
        return place_id

    def key(self, lon: float, lat: float) -> tuple[int, int]:
        return int(math.floor(lon / self.CELL)), int(math.floor(lat / self.CELL))

    def add(self, place_id: str, name: str, lon: float, lat: float, family: str | None) -> None:
        self.ids[place_id] = family or ''
        self.cells[self.key(lon, lat)].append((place_id, name, lon, lat, family))
        self.count += 1

    def near(self, lon: float, lat: float, radius_m: float) -> list[tuple[float, tuple]]:
        reach = int(radius_m / (self.CELL * 100000)) + 1
        x, y = self.key(lon, lat)
        found = []
        for dx in range(-reach, reach + 1):
            for dy in range(-reach, reach + 1):
                for row in self.cells.get((x + dx, y + dy), ()):
                    distance = metres((lon, lat), (row[2], row[3]))
                    if distance <= radius_m:
                        found.append((distance, row))
        found.sort(key=lambda pair: pair[0])
        return found

    def twin(self, name: str, lon: float, lat: float, radius_m: float = 150, touching_m: float = 20):
        """El lugar guardado que es casi seguro el mismo: mismo nombre a < 150 m, o nombre que
        comparte palabras y está pegado (< 20 m)."""
        mine = tokens(name)
        if not mine:
            return None
        for distance, row in self.near(lon, lat, radius_m):
            theirs = tokens(row[1])
            if mine == theirs or (distance <= touching_m and mine & theirs):
                return distance, row
        return None

    def resembles(self, name: str, lon: float, lat: float, radius_m: float = 60):
        """Un parecido que no basta para descartar: comparte alguna palabra a < 60 m."""
        mine = tokens(name)
        for distance, row in self.near(lon, lat, radius_m):
            if mine & tokens(row[1]):
                return {'placeId': row[0], 'name': row[1][:300], 'metres': round(distance)}
        return None


def read_held(boot: Path, skip: Iterable[str] = ()) -> Held:
    """Todas las siembras `bolivia-*poi` salvo las de `skip`, una pieza por vez."""
    skip = set(skip)
    held = Held()
    for directory in sorted(boot.glob('bolivia-*poi')):
        if directory.name in skip:
            continue
        for piece in sorted(directory.glob('*.json')):
            document = json.loads(piece.read_text('utf-8'))
            for place in document.get('places') or []:
                if place.get('latitude') is None:
                    continue
                held.add(Held.normal_id(place['placeId'], directory.name), place.get('name') or '',
                         float(place['longitude']), float(place['latitude']), place.get('entityFamily'))
            del document
    return held
