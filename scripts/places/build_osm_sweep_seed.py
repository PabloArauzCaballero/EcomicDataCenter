#!/usr/bin/env python3
"""Construye `bolivia-osm-sweep-poi`: lo que quedaba de OpenStreetMap tras las cargas por rubro.

    python scripts/places/build_osm_sweep_seed.py --candidates <barrido>/candidatos.ndjson \
      --pbf <barrido>/crudo/bolivia-260923.osm.pbf

El barrido leyó el PBF de Geofabrik del 2026-09-23 entero —todo objeto con clave
de lugar, no solo los rubros que pidieron las cargas anteriores— y lo cruzó con
todo lo cargado. Resultado medido: de 61.140 lugares con nombre válido, 53.545
ya estaban por identificador y 897 por nombre a menos de 100 m. OpenStreetMap
está prácticamente agotado para este corpus; lo que queda son 5.758 filas y más
de la mitad son parques.

Solo entran las etiquetas de esta tabla, y cada una a una familia que el
catálogo ya define. El resto —paradas de taxi, áreas `landuse=commercial`,
santuarios de camino, tumbas— no es un establecimiento o no tiene familia, y se
cuenta en la salida en vez de cargarse como «Sin clasificar».
"""

from __future__ import annotations

import argparse
import collections
import hashlib
import json
from pathlib import Path

ROOT = Path(__file__).resolve().parents[2]
BOOT = ROOT / 'src' / 'database' / 'seeds' / 'boot'
OUT = BOOT / 'bolivia-osm-sweep-poi'
CATALOGUE = Path(__file__).resolve().parent / 'catalogue' / 'bolivia-place-families.json'
SNAPSHOT = '2026-09-23'
PBF_URI = 'https://download.geofabrik.de/south-america/bolivia-260923.osm.pbf'
PIECE = 1200
# `amenity=atm` no está en la tabla: los 585 cajeros que dejó el barrido los
# cubre el registro de la ASFI (`bolivia-asfi-poi`), que es quien los autoriza.
# Cargar los dos contaría cada cajero dos veces con dos nombres distintos.

FAMILY_BY_TAG = {
    'leisure=park': 'PARQUE',
    'landuse=farmyard': 'OV_FARM',
    'leisure=playground': 'OV_PLAYGROUND',
    'amenity=parking': 'ESTACIONAMIENTO',
    'amenity=animal_shelter': 'OV_ANIMAL_SHELTER',
    'leisure=nature_reserve': 'OV_NATURE_RESERVE',
}


def sha256(path: Path) -> str:
    digest = hashlib.sha256()
    with path.open('rb') as handle:
        for block in iter(lambda: handle.read(1 << 20), b''):
            digest.update(block)
    return digest.hexdigest()


def main() -> None:
    parser = argparse.ArgumentParser()
    parser.add_argument('--candidates', required=True, type=Path)
    parser.add_argument('--pbf', required=True, type=Path)
    args = parser.parse_args()

    catalogue = {row['code']: row for row in json.loads(CATALOGUE.read_text('utf-8'))['familias']}
    for family in FAMILY_BY_TAG.values():
        if family not in catalogue:
            raise SystemExit(f'La familia {family} no está en el catálogo')

    places, skipped = [], collections.Counter()
    for line in args.candidates.read_text('utf-8').splitlines():
        row = json.loads(line)
        family = FAMILY_BY_TAG.get(row['categoryKey'])
        if family is None:
            skipped[row['categoryKey']] += 1
            continue
        entry = catalogue[family]
        held = row.get('resemblesHeldPlace')
        resembles = (
            {'placeId': held['placeId'], 'name': held['name'], 'metres': held.get('metres', held.get('distanceM'))}
            if held else None
        )
        tags = row['sourceTags'] or {}
        places.append({
            'placeId': row['placeId'],
            'publisherRecordId': row['publisherRecordId'],
            'publisher': 'OpenStreetMap contributors',
            'name': row['name'],
            'locality': row.get('locality') or None,
            'department': None,
            'address': row.get('address') or None,
            'latitude': row['latitude'],
            'longitude': row['longitude'],
            'entityGroup': entry['group'],
            'entityFamily': family,
            'commercialRole': entry['commercial_role'],
            'isRegulated': bool(entry['is_regulated']),
            'officialValidationSource': entry['official_validation_source'],
            'validationPriority': 'HIGH' if entry['is_regulated'] else 'NORMAL',
            'genericFamily': False,
            'classificationMethod': 'puente_explicito_tags_osm_a_codigos_existentes',
            'categoryKey': row['categoryKey'],
            'taxonomyHierarchy': [],
            'basicCategory': None,
            'confidence': None,
            'positionMethod': 'nodo_osm_original' if row['placeId'].startswith('osm:node:') else 'centro_bbox_objeto_osm_no_es_entrada',
            'dataLevel': 'NOMBRE_ACTIVIDAD_Y_COORDENADAS',
            'phones': [],
            'emails': [],
            'websites': [tags['website']] if tags.get('website') else [],
            'socials': [],
            'warnings': row.get('warnings') or [],
            'sourceDatasetUrl': PBF_URI,
            'sourceRecordUrl': f"https://www.openstreetmap.org/{row['placeId'].split(':')[1]}/{row['publisherRecordId']}",
            'snapshotTakenAt': '2026-09-23T20:22:04Z',
            'sourceTags': tags,
            'openingHours': (tags.get('opening_hours') or '')[:400] or None,
            'resemblesHeldPlace': resembles,
            'licence': 'ODbL-1.0',
            'observationId': row['placeId'],
        })

    places.sort(key=lambda place: place['placeId'])
    provenance = {
        'publishers': ['OpenStreetMap contributors'],
        'release': SNAPSHOT,
        'extractionDate': '2026-09-24',
        'deliverySha256': sha256(args.pbf),
        'deliveryReportSha256': sha256(args.candidates),
        'deliveryUri': PBF_URI,
        'upstreamDatasets': [PBF_URI],
        'licences': ['ODbL-1.0'],
        'geofenceMethod': 'country_polygon',
        'countryCode': 'BO',
        'catalogueFamilies': len(catalogue),
    }
    OUT.mkdir(parents=True, exist_ok=True)
    for old in OUT.glob('*.json'):
        old.unlink()
    for index in range(0, len(places), PIECE):
        target = OUT / f'osm-sweep-poi-{index // PIECE:03d}.json'
        target.write_text(json.dumps({'dataset': 'bolivia-national-poi-v3', 'provenance': provenance,
                                      'places': places[index:index + PIECE]}, ensure_ascii=False, indent=1) + '\n', 'utf-8', newline='\n')
    by_family = collections.Counter(place['entityFamily'] for place in places)
    print(json.dumps({'lugares': len(places), 'familias': dict(by_family),
                      'fuera_de_la_tabla': sum(skipped.values())}, ensure_ascii=False))


if __name__ == '__main__':
    main()
