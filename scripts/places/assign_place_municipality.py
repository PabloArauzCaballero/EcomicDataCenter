#!/usr/bin/env python3
"""Asigna municipio, por sus coordenadas, a los lugares que no declaran localidad.

    python scripts/places/assign_place_municipality.py \
      --adm3 bol_admin3.geojson --adm0 bol_admin0.geojson \
      --retrieved-at 2026-09-24T14:52:00Z

Lee todas las piezas de `bolivia-national-poi` que hay en disco y escribe
`src/database/seeds/boot/bolivia-place-municipality/place-municipality-NNN.json`.

Por qué hace falta: la mitad del corpus nacional no trae localidad — OpenStreetMap
no la publica, la ANH y Tel.bo tampoco — y el tablero agrupa esas filas en «Sin
localidad declarada». Medido el 2026-09-24: 49.802 filas, 8.039 de ellas dentro
del área de Santa Cruz de la Sierra (593 cajeros, 241 bancos, 893 restaurantes).
La ciudad parecía flaca porque sus lugares estaban en otro montón.

Lo que este script NO hace:

- No cambia la localidad que una fila ya declara. Donde la fuente dijo un
  municipio, manda la fuente; esto solo llena el hueco. (Medida la concordancia
  sobre las 73.957 filas que sí declaran: 97,5 %, y los desacuerdos son sobre
  todo el vecino conurbado — Santa Cruz y La Guardia, La Paz y El Alto.)
- No toca las filas cargadas. El cargador es idempotente por huella: reescribir
  una fila con otra localidad añadiría una segunda al lado. Por eso la
  asignación viaja como observación propia y la vista la une por `placeId`.

Límites: COD-AB Bolivia v02 (OCHA/HDX; Ministerio de Desarrollo Rural y Tierras
con geometría de GeoBolivia; CC BY-IGO). Geometría de 2013: los municipios
creados después no tienen polígono y sus lugares caen en el municipio madre. Los
cuerpos de agua son huecos en la capa: un punto a 500 m o menos del municipio
más cercano va a ese municipio y lo dice; más lejos queda sin municipio.
"""

from __future__ import annotations

import argparse
import hashlib
import json
import math
from pathlib import Path

from shapely.geometry import Point, shape
from shapely.prepared import prep
from shapely.strtree import STRtree

ROOT = Path(__file__).resolve().parents[2]
BOOT = ROOT / 'src' / 'database' / 'seeds' / 'boot'
OUT = BOOT / 'bolivia-place-municipality'
CATALOGUE = Path(__file__).resolve().parent / 'catalogue' / 'bolivia-municipalities.json'
# Las carpetas del paquete `bolivia-national-poi`, salvo esta misma.
PLACE_DIRECTORIES = sorted(
    path for path in BOOT.iterdir()
    if path.is_dir() and path.name.startswith('bolivia-') and path.name.endswith('-poi')
    and path.name != 'bolivia-poi'  # las tres ciudades: todas traen ciudad
)
PIECE = 5000
NEAREST_METRES = 500
LAYER_URI = 'https://data.humdata.org/dataset/cod-ab-bol'


def sha256(path: Path) -> str:
    return hashlib.sha256(path.read_bytes()).hexdigest()


def metres(a: Point, b: Point) -> float:
    # Equirectangular: sobra para decidir si un punto está a 500 m de un borde.
    lat = math.radians((a.y + b.y) / 2)
    return math.hypot((a.x - b.x) * math.cos(lat), a.y - b.y) * 111_320


def main() -> None:
    parser = argparse.ArgumentParser()
    parser.add_argument('--adm3', required=True, type=Path)
    parser.add_argument('--adm0', required=True, type=Path)
    parser.add_argument('--retrieved-at', required=True)
    args = parser.parse_args()

    catalogue = {row['code']: row for row in json.loads(CATALOGUE.read_text('utf-8'))['municipalities']}
    features = json.loads(args.adm3.read_text('utf-8'))['features']
    geoms, codes = [], []
    for feature in features:
        geom = shape(feature['geometry'])
        geoms.append(geom if geom.is_valid else geom.buffer(0))
        codes.append(feature['properties']['adm3_pcode'][2:])
    missing = set(codes) - set(catalogue)
    if missing:
        raise SystemExit(f'Municipios de la capa sin fila en el catálogo: {sorted(missing)}')
    tree = STRtree(geoms)
    country = prep(shape(json.loads(args.adm0.read_text('utf-8'))['features'][0]['geometry']))

    seen: set[str] = set()
    rows: list[dict] = []
    tally = {'MUNICIPIO': 0, 'MUNICIPIO_CERCANO': 0, 'SIN_POLIGONO': 0, 'FUERA_DE_BOLIVIA': 0}
    for directory in PLACE_DIRECTORIES:
        for piece in sorted(directory.glob('*.json')):
            for place in json.loads(piece.read_text('utf-8'))['places']:
                if place.get('locality') or place['placeId'] in seen:
                    continue
                seen.add(place['placeId'])
                point = Point(place['longitude'], place['latitude'])
                hits = [int(i) for i in tree.query(point, predicate='intersects')]
                row = {'placeId': place['placeId']}
                if len(hits) >= 1:
                    # Un punto sobre el borde toca dos: gana el código menor, siempre el mismo.
                    code = min(codes[i] for i in hits)
                    row |= {'method': 'MUNICIPIO', 'municipalityCode': code}
                elif not country.contains(point):
                    row |= {'method': 'FUERA_DE_BOLIVIA', 'municipalityCode': None}
                else:
                    near = sorted(
                        (metres(point, geoms[i].exterior.interpolate(geoms[i].exterior.project(point)))
                         if geoms[i].geom_type == 'Polygon'
                         else min(metres(point, g.exterior.interpolate(g.exterior.project(point))) for g in geoms[i].geoms),
                         codes[i])
                        for i in (int(j) for j in tree.query(point.buffer(0.05)))
                    )
                    if near and near[0][0] <= NEAREST_METRES:
                        row |= {'method': 'MUNICIPIO_CERCANO', 'municipalityCode': near[0][1],
                                'distanceMetres': round(near[0][0])}
                    else:
                        row |= {'method': 'SIN_POLIGONO', 'municipalityCode': None}
                code = row['municipalityCode']
                municipality = catalogue[code] if code else None
                row |= {
                    'municipality': municipality['name'] if municipality else None,
                    'department': municipality['department'] if municipality else None,
                }
                row.setdefault('distanceMetres', None)
                tally[row['method']] += 1
                rows.append(row)

    rows.sort(key=lambda row: row['placeId'])
    OUT.mkdir(parents=True, exist_ok=True)
    for old in OUT.glob('*.json'):
        old.unlink()
    provenance = {
        'publisher': 'OCHA Field Information Services (HDX)',
        'originalPublisher': 'Ministerio de Desarrollo Rural y Tierras, geometría GeoBolivia',
        'layer': 'COD-AB Bolivia v02, adm3 (339 municipios)',
        'layerUri': LAYER_URI,
        'layerSha256': sha256(args.adm3),
        'countrySha256': sha256(args.adm0),
        'licence': 'CC BY-IGO',
        'geometryEditedOn': '2013-01-01',
        'retrievedAt': args.retrieved_at,
        'nearestMetres': NEAREST_METRES,
    }
    for index in range(0, len(rows), PIECE):
        target = OUT / f'place-municipality-{index // PIECE:03d}.json'
        target.write_text(
            json.dumps({'dataset': 'bolivia-place-municipality', 'provenance': provenance,
                        'assignments': rows[index:index + PIECE]}, ensure_ascii=False, indent=1) + '\n',
            'utf-8',
            newline='\n',
        )
    print(json.dumps({'filas': len(rows), **tally}, ensure_ascii=False))


if __name__ == '__main__':
    main()
