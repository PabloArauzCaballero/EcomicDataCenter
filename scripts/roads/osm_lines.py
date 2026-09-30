#!/usr/bin/env python3
"""Las lineas de un extracto de OpenStreetMap, con poca memoria.

`FileProcessor.with_locations()` guarda la coordenada de todos los nodos del
pais (unos 25 millones) antes de entregar la primera via, y el 2026-09-27 eso
murio con `MemoryError` en una maquina que tenia 400 MB libres. Aqui se hace
en dos pasadas: la primera elige las vias y anota que nodos necesitan; la
segunda lee solo esos nodos, filtrados por id dentro de libosmium, a dos
arreglos de numpy. Lo usan la red vial, la ferroviaria y la fluvial.
"""

from __future__ import annotations

from typing import Callable

import numpy as np
import osmium

Tags = dict[str, str]


def read_lines(pbf_path: str, keep: Callable[[int, Tags], bool]) -> list[tuple[int, Tags, list[tuple[float, float]]]]:
    """Cada via que `keep` acepta, con sus etiquetas y sus coordenadas `(lon, lat)`."""
    chosen: list[tuple[int, Tags, list[int]]] = []
    ways = osmium.FileProcessor(pbf_path).with_filter(osmium.filter.EntityFilter(osmium.osm.WAY))
    for way in ways:
        tags = {tag.k: tag.v for tag in way.tags}
        if keep(way.id, tags):
            chosen.append((way.id, tags, [node.ref for node in way.nodes]))

    wanted = np.unique(np.fromiter((ref for _, _, refs in chosen for ref in refs), dtype=np.int64))
    lon = np.full(wanted.size, np.nan)
    lat = np.full(wanted.size, np.nan)
    nodes = (
        osmium.FileProcessor(pbf_path)
        .with_filter(osmium.filter.EntityFilter(osmium.osm.NODE))
        .with_filter(osmium.filter.IdFilter(wanted.tolist()))
    )
    for node in nodes:
        at = np.searchsorted(wanted, node.id)
        if at < wanted.size and wanted[at] == node.id and node.location.valid():
            lon[at], lat[at] = node.location.lon, node.location.lat

    lines = []
    for way_id, tags, refs in chosen:
        at = np.searchsorted(wanted, np.asarray(refs, dtype=np.int64))
        coords = [(float(lon[i]), float(lat[i])) for i in at if not np.isnan(lon[i])]
        # Un nodo fuera del extracto corta la via en el borde; si faltan todos, no hay via.
        if len(coords) >= 2:
            lines.append((way_id, tags, coords))
    return lines


def read_points(pbf_path: str, keep: Callable[[Tags], bool]) -> list[tuple[str, int, Tags, tuple[float, float]]]:
    """Nodos que `keep` acepta y, para vias cerradas (una estacion, un puerto), su centro."""
    points: list[tuple[str, int, Tags, tuple[float, float]]] = []
    nodes = osmium.FileProcessor(pbf_path).with_filter(osmium.filter.EntityFilter(osmium.osm.NODE))
    for node in nodes:
        if not node.tags:
            continue
        tags = {tag.k: tag.v for tag in node.tags}
        if keep(tags) and node.location.valid():
            points.append(('n', node.id, tags, (node.location.lon, node.location.lat)))
    areas = read_lines(pbf_path, lambda _id, tags: keep(tags))
    for way_id, tags, coords in areas:
        lons = [lon for lon, _ in coords]
        lats = [lat for _, lat in coords]
        points.append(('w', way_id, tags, (sum(lons) / len(lons), sum(lats) / len(lats))))
    return points
