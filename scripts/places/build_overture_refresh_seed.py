#!/usr/bin/env python3
"""Construye `bolivia-overture-refresh-poi`: los lugares de Overture que el corpus no tenía.

    python scripts/places/build_overture_refresh_seed.py \
      --candidates <extracto>/candidatos.ndjson \
      --release-parquet <extracto>/crudo/places_bbox_bolivia_2026-09-23.0.parquet \
      --previous-parquet <extracto>/crudo/places_bbox_bolivia_2026-08-19.0.parquet

`candidatos.ndjson` es la salida de la extracción documentada en
`docs/runbooks/overture-refresh-places.md`: los places de Bolivia de la release
2026-09-23.0 que no estaban cargados ni por identificador ni por nombre idéntico
a menos de 100 m, ya sin rasgos geográficos, nombres basura, duplicados internos
ni coordenadas apiladas en el centro de una ciudad.

Por qué faltaban: el corpus de tres ciudades cortó en confianza 0,6 y la entrega
nacional en familias estables. El 93 % de lo que falta es la franja 0,3-0,6 de
páginas de Meta. Aquí se corta en **0,3**, por decisión del usuario del
2026-09-24 para acercar el corpus a 200.000 lugares: el escalón del histograma
está en 0,5 (20.781 places de Bolivia entre 0,5 y 0,6 contra 10.619 entre 0,4 y
0,5) y las 19.282 filas entre 0,3 y 0,5 llevan `confianza_overture_baja_0_3_a_0_5`.
Por debajo de 0,3 no entra nada. Overture no publica si un local cerró
(`operating_status` nulo en 101.527 de 101.529), así que la confianza es la única
señal y cada fila la dice.

Fuera también, aunque pasen el corte:
- sin categoría nativa: sin ella no hay familia, y una fila sin rubro solo
  engorda «Sin clasificar»;
- `historic_site`: en Bolivia son sobre todo condominios y edificios, no patrimonio;
- nombres que son solo la actividad («Farmacia», «Tienda»).

La familia sale de lo que el corpus ya decidió. Para cada categoría de Overture se
mira qué familia recibieron los lugares de Overture ya cargados con esa categoría
(leída del parquet de 2026-08-19.0, la release que se cargó) y gana la familia
específica más votada; `OTRA_ENTIDAD` y `OV_SERVICES_AND_BUSINESS` no votan,
porque ahí fueron a parar filas que el anexo de 201 no sabía nombrar y no porque
esa fuera su familia. Si la categoría no se cargó nunca, su propio código `OV_…`
del catálogo de 2.330; si tampoco existe, el de su padre en la jerarquía de
Overture, y la fila lo dice (`genericFamily`).
"""

from __future__ import annotations

import argparse
import collections
import hashlib
import json
from pathlib import Path

import duckdb

ROOT = Path(__file__).resolve().parents[2]
OUT = ROOT / 'src' / 'database' / 'seeds' / 'boot' / 'bolivia-overture-refresh-poi'
BOOT = ROOT / 'src' / 'database' / 'seeds' / 'boot'
CATALOGUE = Path(__file__).resolve().parent / 'catalogue' / 'bolivia-place-families.json'
RELEASE = '2026-09-23.0'
DATASET_URI = f's3://overturemaps-us-west-2/release/{RELEASE}/theme=places/type=place/'
MINIMUM_CONFIDENCE = 0.3
PIECE = 1200
NOT_A_VOTE = {'OTRA_ENTIDAD', 'OV_SERVICES_AND_BUSINESS'}
DROPPED_CATEGORIES = {'historic_site'}


def sha256(path: Path) -> str:
    digest = hashlib.sha256()
    with path.open('rb') as handle:
        for block in iter(lambda: handle.read(1 << 20), b''):
            digest.update(block)
    return digest.hexdigest()


def text_tags(tags: dict) -> dict[str, str]:
    """El esquema guarda las etiquetas como texto: lo que no lo es viaja en JSON."""
    return {key: value if isinstance(value, str) else json.dumps(value, ensure_ascii=False)
            for key, value in tags.items() if value is not None}


def loaded_overture_families() -> dict[str, str]:
    """El identificador de Overture de cada lugar ya cargado y la familia que recibió."""
    held: dict[str, str] = {}
    for piece in sorted(BOOT.glob('bolivia-*poi/*.json')):
        # Sus propias piezas no votan: una segunda construcción votaría con la primera.
        if piece.parent == OUT:
            continue
        for place in json.loads(piece.read_text('utf-8'))['places']:
            place_id = place['placeId']
            if piece.parent.name == 'bolivia-poi':
                held[place_id] = place['entityFamily']
            elif place_id.startswith('overture:'):
                held[place_id[len('overture:'):]] = place['entityFamily']
    return held


def votes_by_category(previous: Path, held: dict[str, str]) -> dict[str, collections.Counter]:
    rows = duckdb.connect().execute(
        'SELECT id, taxonomy.primary FROM read_parquet(?)', [str(previous)]
    ).fetchall()
    votes: dict[str, collections.Counter] = collections.defaultdict(collections.Counter)
    for place_id, category in rows:
        family = held.get(place_id)
        if category and family and family not in NOT_A_VOTE:
            votes[category][family] += 1
    return votes


def family_for(category: str, hierarchy: list[str], votes, catalogue) -> tuple[str | None, bool]:
    """La familia y si salió de un antepasado de la categoría, no de ella misma."""
    for depth, key in enumerate([category, *reversed(hierarchy[:-1])]):
        if key in votes:
            return votes[key].most_common(1)[0][0], depth > 0
        if f'OV_{key.upper()}' in catalogue:
            return f'OV_{key.upper()}', depth > 0
    return None, False


def main() -> None:
    parser = argparse.ArgumentParser()
    parser.add_argument('--candidates', required=True, type=Path)
    parser.add_argument('--release-parquet', required=True, type=Path)
    parser.add_argument('--previous-parquet', required=True, type=Path)
    args = parser.parse_args()

    catalogue = {row['code']: row for row in json.loads(CATALOGUE.read_text('utf-8'))['familias']}
    votes = votes_by_category(args.previous_parquet, loaded_overture_families())

    places, dropped = [], collections.Counter()
    for line in args.candidates.read_text('utf-8').splitlines():
        row = json.loads(line)
        tags = row['sourceTags']
        category = row['categoryKey']
        if (row['confidence'] or 0) < MINIMUM_CONFIDENCE:
            dropped['confianza_menor_a_0_3'] += 1
            continue
        if not category:
            dropped['sin_categoria_nativa'] += 1
            continue
        if category in DROPPED_CATEGORIES:
            dropped[f'categoria_{category}'] += 1
            continue
        if 'nombre_generico' in row['warnings']:
            dropped['nombre_es_solo_la_actividad'] += 1
            continue
        family, from_parent = family_for(category, tags.get('taxonomyHierarchy') or [], votes, catalogue)
        if family is None:
            dropped['categoria_sin_familia'] += 1
            continue
        entry = catalogue[family]
        warnings = [w for w in row['warnings'] if w not in ('resemblesHeldPlace', 'confianza_baja_<0.5')]
        confidence = row['confidence']
        warnings.append(
            'confianza_overture_baja_0_3_a_0_5' if confidence < 0.5
            else 'confianza_overture_entre_0_5_y_0_6' if confidence < 0.6
            else 'confianza_overture_0_6_o_mas'
        )
        resembles = row['resemblesHeldPlace']
        places.append({
            'placeId': row['placeId'],
            'publisherRecordId': row['publisherRecordId'],
            'publisher': 'Overture Maps Foundation',
            'name': row['name'],
            'locality': row['locality'],
            # Overture no declara departamento; el que trae el extracto es una
            # contención en sus divisiones y no se hace pasar por declarado.
            'department': None,
            'address': row['address'] or None,
            'latitude': row['latitude'],
            'longitude': row['longitude'],
            'entityGroup': entry['group'],
            'entityFamily': family,
            'commercialRole': entry['commercial_role'],
            'isRegulated': bool(entry['is_regulated']),
            'officialValidationSource': entry['official_validation_source'],
            'validationPriority': 'HIGH' if entry['is_regulated'] else 'NORMAL',
            'genericFamily': from_parent,
            'classificationMethod': 'categoria_overture_por_familia_ya_asignada_en_el_corpus',
            'categoryKey': category,
            'taxonomyHierarchy': tags.get('taxonomyHierarchy') or [],
            'basicCategory': tags.get('basicCategory'),
            'confidence': row['confidence'],
            'positionMethod': None,
            'dataLevel': 'B_REGISTRO_CARTOGRAFICO',
            'phones': row['phones'] or [],
            'emails': [],
            'websites': row['websites'] or [],
            'socials': row['socials'] or [],
            'warnings': warnings,
            'sourceDatasetUrl': DATASET_URI,
            'sourceRecordUrl': None,
            'snapshotTakenAt': None,
            'sourceTags': text_tags(tags),
            'openingHours': None,
            'resemblesHeldPlace': (
                {'placeId': resembles['placeId'], 'name': resembles['name'], 'metres': resembles['distanceM']}
                if resembles else None
            ),
            'licence': row['licence'],
            'observationId': row['placeId'],
        })

    places.sort(key=lambda place: place['placeId'])
    provenance = {
        'publishers': ['Overture Maps Foundation'],
        'release': RELEASE,
        'extractionDate': '2026-09-24',
        'deliverySha256': sha256(args.release_parquet),
        'deliveryReportSha256': sha256(args.candidates),
        'deliveryUri': DATASET_URI,
        'upstreamDatasets': [DATASET_URI],
        'licences': sorted({place['licence'] for place in places}),
        'geofenceMethod': 'country_polygon',
        'countryCode': 'BO',
        'catalogueFamilies': len(catalogue),
    }
    OUT.mkdir(parents=True, exist_ok=True)
    for old in OUT.glob('*.json'):
        old.unlink()
    for index in range(0, len(places), PIECE):
        target = OUT / f'overture-refresh-poi-{index // PIECE:03d}.json'
        target.write_text(json.dumps({'dataset': 'bolivia-national-poi-v3', 'provenance': provenance,
                                      'places': places[index:index + PIECE]}, ensure_ascii=False, indent=1) + '\n', 'utf-8', newline='\n')
    print(json.dumps({'lugares': len(places), 'descartados': dict(dropped),
                      'familias': len({p['entityFamily'] for p in places})}, ensure_ascii=False))


if __name__ == '__main__':
    main()
