#!/usr/bin/env python3
"""Extracts Bolivia's health-sector rows from an OpenStreetMap PBF extract.

Usage:
    pip install osmium
    python scripts/places/extract_health_osm.py <bolivia.osm.pbf> <out.json>

The task this script serves asked for a live Overpass query
(``overpass-api.de/api/interpreter``, filtered by ``amenity`` and
``healthcare``). Every Overpass mirror reachable from this environment
refused the connection outright or timed out on the query — verified against
overpass-api.de, overpass.kumi.systems, lz4.overpass-api.de,
z.overpass-api.de, overpass.private.coffee and overpass.osm.jp; the one
mirror that answered, maps.mail.ru, returned a server timeout on this
specific query. `download.geofabrik.de` is reachable and republishes the
same OpenStreetMap database as a signed, dated extract, so this script reads
that instead. It changes how the data was fetched, not what it says: both
are the same upstream database under the same licence (ODbL-1.0), and the
extract this script reads has its own SHA-256 to cite, which a live Overpass
answer would not have had.

`scripts/places/read-health-osm.mjs` does the classification (OpenStreetMap
does not tag "family codes"); this script only pulls the rows and their raw
tags out of the PBF, unchanged, so that step has something to classify.
"""

from __future__ import annotations

import datetime
import hashlib
import json
import sys

import osmium

WANTED_AMENITY = frozenset(
    {
        "hospital",
        "clinic",
        "doctors",
        "pharmacy",
        "dentist",
        "laboratory",
        "blood_donation",
        "nursing_home",
    }
)


class HealthHandler(osmium.SimpleHandler):
    """Collects every node and closed way that names a health-sector tag."""

    def __init__(self) -> None:
        super().__init__()
        self.rows: list[dict] = []

    def _consider(self, kind: str, object_id: int, tags, latitude: float, longitude: float) -> None:
        tag_map = {tag.k: tag.v for tag in tags}
        amenity = tag_map.get("amenity")
        healthcare = tag_map.get("healthcare")
        if amenity not in WANTED_AMENITY and not healthcare:
            return
        # Un nodo sin nombre no es un lugar publicable: es un punto vacio.
        name = tag_map.get("name") or tag_map.get("name:es") or tag_map.get("official_name")
        if not name:
            return
        self.rows.append(
            {
                "id": f"osm:{kind}:{object_id}",
                "nombre": name,
                "latitud": latitude,
                "longitud": longitude,
                "amenity": amenity,
                "healthcare": healthcare,
                "raw_tags": tag_map,
                "metodo_posicion": (
                    "nodo_osm_original" if kind == "node" else "centro_bbox_objeto_osm_no_es_entrada"
                ),
            }
        )

    def node(self, node) -> None:
        if not node.location.valid():
            return
        self._consider("node", node.id, node.tags, node.location.lat, node.location.lon)

    def way(self, way) -> None:
        # Solo poligonos cerrados: una via abierta no tiene un adentro que
        # centrar, y un centroide sobre sus puntos seria un lugar inventado.
        if not way.is_closed() or len(way.nodes) < 3:
            return
        latitudes = [n.lat for n in way.nodes if n.location.valid()]
        longitudes = [n.lon for n in way.nodes if n.location.valid()]
        if not latitudes:
            return
        centroid_lat = sum(latitudes) / len(latitudes)
        centroid_lon = sum(longitudes) / len(longitudes)
        self._consider("way", way.id, way.tags, centroid_lat, centroid_lon)


def main() -> int:
    if len(sys.argv) != 3:
        print(f"usage: {sys.argv[0]} <bolivia.osm.pbf> <out.json>", file=sys.stderr)
        return 1
    pbf_path, out_path = sys.argv[1], sys.argv[2]

    handler = HealthHandler()
    handler.apply_file(pbf_path, locations=True)
    print(f"rows: {len(handler.rows)}", file=sys.stderr)

    with open(pbf_path, "rb") as pbf_file:
        source_sha256 = hashlib.sha256(pbf_file.read()).hexdigest()

    document = {
        "extraction": {
            "source": "https://download.geofabrik.de/south-america/bolivia-260922.osm.pbf",
            "sourceSha256": source_sha256,
            "snapshotDate": "2026-09-22",
            "extractedAt": datetime.datetime.now(datetime.timezone.utc).isoformat(),
            "licence": "ODbL-1.0",
            "attribution": "© OpenStreetMap contributors",
            "filters": {"amenity": sorted(WANTED_AMENITY), "healthcare": "any"},
        },
        "registros": handler.rows,
    }
    with open(out_path, "w", encoding="utf-8") as out_file:
        json.dump(document, out_file, ensure_ascii=False)
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
