#!/usr/bin/env python3
"""Construye `bolivia-fsq-poi`: todo lo que Foursquare tiene en Bolivia fuera de salud y el corpus no.

    python scripts/places/build_fsq_poi_seed.py \
      --extract <e>/fsq_bolivia_2026-09-15.parquet --adm0 <e>/bol_admin0.geojson \
      --retrieved 2026-09-28T03:30:00Z

Mismo extracto y mismas reglas de calidad que `build_fsq_health_poi_seed.py` (la salud va allí y
aquí se salta). Lo que cambia es la familia: Foursquare tiene cientos de categorías y el catálogo
no las define. Se decide **por voto del corpus**: cada fila de Foursquare que ya estaba cargada
(mismo nombre a menos de `SAME_M`) dice en qué familia archivó el corpus ese mismo local; una
categoría toma la familia que gana con al menos `VOTE_SHARE` de `VOTE_MIN` votos. Las piezas de
Foursquare no votan: si votaran, una segunda construcción reclasificaría filas ya cargadas (la
trampa del constructor de Overture). Para las categorías frecuentes sin voto claro hay un mapa
escrito, siempre hacia familias que el catálogo ya tiene. Lo que no es un establecimiento —calles,
barrios, ciudades, casas, eventos, «Oficina» genérica— no entra. Ver `docs/runbooks/fsq-health-load.md`.
"""

from __future__ import annotations

import argparse
import collections
import hashlib
import json
import re
from pathlib import Path

from health_sources import Grid, folded, read_held

ROOT = Path(__file__).resolve().parents[2]
BOOT = ROOT / 'src' / 'database' / 'seeds' / 'boot'
OUT = BOOT / 'bolivia-fsq-poi'
REPORT = ROOT / 'artifacts' / 'fsq-poi-already-held.json'
CATALOGUE = Path(__file__).resolve().parent / 'catalogue' / 'bolivia-place-families.json'
DATASET_URI = 'https://huggingface.co/datasets/foursquare/fsq-os-places/tree/main/release/dt=2026-09-15'
PIECE = 1200
STALE_BEFORE = '2020'
SAME_M, TOUCHING_M, TWIN_M, RESEMBLE_M = 150, 20, 50, 60
VOTE_MIN, VOTE_SHARE = 3, 0.6
BAD_FLAGS = {'closed', 'doesnt_exist', 'duplicate', 'privatevenue', 'inappropriate', 'delete'}
# No son establecimientos, o son la casa de alguien.
NOT_A_PLACE = re.compile(r'^Health and Medicine|^Retail > (Pharmacy|Eyecare)|^Event|Residen|Home \(private\)|'
                         r'Housing Development|States and Municipalities|> Road$|> Street|> Plane$|> Structure$|'
                         r'> Field$|> Bridge|> Intersection|Business and Professional Services > Office$|'
                         r'> Office > Coworking|Other Great Outdoors')
PRIVATE_NAME = re.compile(r'\b(MI|MIS|MY)\b|^CASA\b|\bCASA DE\b|CUARTO|DORMITORIO|\bBANO\b|\bCAMA\b|'
                          r'\bDEPTO\b|DEPARTAMENTO DE [A-Z]+$|\bHOME\b|\bHOUSE\b')
# Categorías frecuentes que el voto no decide, a una familia que el catálogo ya tiene.
WRITTEN = {
    'Business and Professional Services > Factory': 'FABRICA_PLANTA',
    'Business and Professional Services > Health and Beauty Service > Hair Salon': 'PELUQUERIA',
    'Business and Professional Services > Automotive Service > Automotive Repair Shop': 'TALLER_MECANICO',
    'Business and Professional Services > Automotive Service > Car Wash and Detail': 'LAVADERO_AUTOS',
    'Community and Government > Spiritual Center > Church': 'OV_CHRISTIAN_PLACE_OF_WORSHIP',
    'Community and Government > Organization > Non-Profit Organization': 'OV_SOCIAL_OR_COMMUNITY_SERVICE',
    'Community and Government > Education > College and University > College Academic Building': 'UNIVERSIDAD',
    'Community and Government > Education > College and University > College Classroom': 'UNIVERSIDAD',
    'Retail > Department Store': 'TIENDA_DEPARTAMENTOS',
    'Retail > Computers and Electronics Retail > Electronics Store': 'ELECTRONICA',
    'Retail > Computers and Electronics Retail > Mobile Phone Store': 'ELECTRONICA',
    'Retail > Fashion Retail > Shoe Store': 'CALZADOS',
    'Retail > Furniture and Home Store': 'MUEBLES_HOGAR',
    'Retail > Market': 'MERCADO',
    'Travel and Transportation > Lodging > Hostel': 'HOSTAL_HOSTEL',
    'Landmarks and Outdoors > Plaza': 'PLAZA',
    'Sports and Recreation > Soccer > Soccer Field': 'CANCHA',
    'Dining and Drinking > Breakfast Spot': 'OV_BREAKFAST_AND_BRUNCH_RESTAURANT',
    'Dining and Drinking > Restaurant > Sandwich Spot': 'OV_SANDWICH_SHOP',
    'Dining and Drinking > Snack Place': 'COMIDA_RAPIDA',
    'Dining and Drinking > Food Truck': 'OV_FOOD_TRUCK_STAND',
    'Dining and Drinking > Dessert Shop': 'OV_DESSERT_SHOP',
    'Dining and Drinking > Bar > Karaoke Bar': 'OV_KARAOKE_VENUE',
    'Dining and Drinking > Bar > Lounge': 'BAR_PUB',
    'Business and Professional Services > Office > Tech Startup': 'SOFTWARE_TI',
}
# Donde un registro oficial ya enumera todo, lo que Foursquare tiene de más es casi siempre lo
# cerrado o movido: la ASFI publica cada punto que autoriza y el SIE cada unidad educativa. Los
# «aeropuertos» de Foursquare son pistas y puertas; transporte ya los tiene de OpenStreetMap.
COVERED_BY_REGISTRY = {'BANCO', 'CAJERO_ATM', 'COLEGIO_ESCUELA', 'AEROPUERTO', 'OV_AIRPORT_TERMINAL'}
GENERIC = {'RESTAURANTE', 'RESTAURANT', 'TIENDA', 'MERCADO', 'IGLESIA', 'PLAZA', 'CANCHA', 'OFICINA', 'PARQUEO',
           'PARADA', 'COLEGIO', 'ESCUELA', 'BANCO', 'CAFE', 'BAR', 'HOTEL', 'HOSTAL', 'PARQUE', 'PELUQUERIA',
           'TALLER', 'MECANICO', 'LAVADERO', 'PANADERIA', 'POLLERIA', 'PENSION', 'KIOSCO', 'KIOSKO', 'CASA',
           'DE', 'DEL', 'LA', 'EL', 'LOS', 'LAS', 'Y', 'EN', 'CENTRO', 'SALON', 'EVENTOS', 'FERIA', 'ALMACEN',
           'MINIMARKET', 'SUPERMERCADO', 'LIBRERIA', 'FOTOCOPIAS', 'INTERNET', 'CABINAS', 'GARAJE', 'GARAGE',
           'TRABAJO', 'OBRA', 'UNIVERSIDAD', 'AULA', 'CLASE', 'CURSO', 'CAMPO', 'PISCINA', 'GIMNASIO', 'GYM'}
STOP = {'DE', 'DEL', 'LA', 'EL', 'LOS', 'LAS', 'Y', 'SUCURSAL', 'SUC', 'BOLIVIA', 'BOLIVIANA', 'BOLIVIANO',
        'SAN', 'SANTA', 'CRUZ', 'PAZ', 'SIERRA', 'RESTAURANTE', 'RESTAURANT', 'TIENDA', 'HOTEL', 'BAR', 'CAFE'}


def sha256(path: Path) -> str:
    return hashlib.sha256(path.read_bytes()).hexdigest()


def tokens(name: str) -> set[str]:
    return {t for t in folded(name).split() if t not in STOP and len(t) > 1}


def families_by_vote(rows, grid) -> dict[str, str]:
    votes = collections.defaultdict(collections.Counter)
    for _fsq_id, name, lat, lon, labels, *_ in rows:
        if not labels or lat is None:
            continue
        mine = tokens(name or '')
        twin = next((h for _, h in grid.near((lon, lat), SAME_M) if mine and mine == tokens(h['name'])), None)
        if twin and twin.get('family'):
            votes[labels[0]][twin['family']] += 1
    decided = {}
    for label, counter in votes.items():
        family, count = counter.most_common(1)[0]
        if sum(counter.values()) >= VOTE_MIN and count / sum(counter.values()) >= VOTE_SHARE:
            decided[label] = family
    return decided


def main() -> None:
    parser = argparse.ArgumentParser()
    parser.add_argument('--extract', required=True, type=Path)
    parser.add_argument('--adm0', required=True, type=Path)
    parser.add_argument('--retrieved', required=True)
    args = parser.parse_args()

    import duckdb
    from shapely.geometry import Point, shape
    from shapely.prepared import prep

    catalogue = {row['code']: row for row in json.loads(CATALOGUE.read_text('utf-8'))['familias']}
    country = prep(shape(json.loads(args.adm0.read_text('utf-8'))['features'][0]['geometry']))
    rows = duckdb.connect().execute(
        f"""SELECT fsq_place_id, name, latitude, longitude, fsq_category_labels, address,
                   date_created, date_refreshed, date_closed, unresolved_flags
            FROM read_parquet('{args.extract.as_posix()}') ORDER BY fsq_place_id""").fetchall()

    family_of_place = {}
    for piece in BOOT.glob('*-poi/*.json'):
        for place in json.loads(piece.read_text('utf-8')).get('places') or []:
            family_of_place[place['placeId']] = place['entityFamily']
    voters = read_held(BOOT, OUT, lambda place: not place['placeId'].startswith('fsq:'))
    for row in voters:
        row['family'] = family_of_place.get(row['placeId'])
    decided = {**families_by_vote(rows, Grid(voters, cell=0.002)), **WRITTEN}
    decided = {label: family for label, family in decided.items() if family in catalogue}
    grid = Grid(read_held(BOOT, OUT, lambda place: True), cell=0.002)

    dropped, already, candidates = collections.Counter(), [], []
    for fsq_id, name, lat, lon, labels, address, created, refreshed, closed, flags in rows:
        label = (labels or [None])[0]
        name = re.sub(r'\s+', ' ', name or '').strip()
        plain = folded(name)
        if not label or NOT_A_PLACE.search(label):
            dropped['no_es_un_establecimiento_o_es_salud'] += 1
        elif closed or set(flags or []) & BAD_FLAGS:
            dropped['cerrado_o_marcado_por_foursquare'] += 1
        elif lat is None or not country.contains(Point(lon, lat)):
            dropped['fuera_de_bolivia'] += 1
        elif label not in decided:
            dropped['categoria_sin_familia_decidible'] += 1
        elif decided[label] in COVERED_BY_REGISTRY or catalogue[decided[label]]['group'] == 'FINANZAS':
            dropped['cubierto_por_un_registro_oficial'] += 1
        elif not plain or set(plain.split()) <= GENERIC or PRIVATE_NAME.search(plain):
            dropped['nombre_generico_o_privado'] += 1
        else:
            point, mine = (lon, lat), tokens(name)
            near = grid.near(point, SAME_M)
            twin = next(((d, h) for d, h in near if (mine and mine == tokens(h['name']))
                         or (d <= TOUCHING_M and mine & tokens(h['name']))), None)
            if twin:
                already.append({'fsq': fsq_id, 'nombre': name, 'placeId': twin[1]['placeId'], 'metros': round(twin[0])})
                dropped['ya_estaba_en_el_corpus'] += 1
                continue
            candidates.append({'id': fsq_id, 'name': name, 'point': point, 'address': address, 'label': label,
                               'family': decided[label], 'written': label in WRITTEN, 'created': created,
                               'refreshed': refreshed or '',
                               'resembles': next(((d, h) for d, h in near if d <= RESEMBLE_M
                                                  and mine & tokens(h['name'])), None)})

    candidates.sort(key=lambda row: (row['refreshed'], row['id']), reverse=True)
    kept, own = [], Grid([], cell=0.002)
    for row in candidates:
        if any(tokens(row['name']) == tokens(h['name']) for _, h in own.near(row['point'], TWIN_M)):
            dropped['ficha_repetida_en_foursquare'] += 1
            continue
        own.cells[own.key(row['point'])].append(row)
        kept.append(row)

    places = []
    for row in kept:
        entry = catalogue[row['family']]
        stale = row['refreshed'][:4] < STALE_BEFORE
        resembles = row['resembles']
        places.append({
            'placeId': f"fsq:{row['id']}", 'publisherRecordId': row['id'],
            'publisher': 'Foursquare Open Source Places', 'name': row['name'][:300],
            'locality': None, 'department': None, 'address': (row['address'] or '').strip()[:300] or None,
            'latitude': round(row['point'][1], 7), 'longitude': round(row['point'][0], 7),
            'entityGroup': entry['group'], 'entityFamily': row['family'], 'commercialRole': entry['commercial_role'],
            'isRegulated': bool(entry['is_regulated']), 'officialValidationSource': entry['official_validation_source'],
            'validationPriority': 'NORMAL', 'genericFamily': row['family'].startswith('OV_'),
            'classificationMethod': 'categoria_foursquare_a_familia_existente',
            'categoryKey': row['label'][:120], 'taxonomyHierarchy': row['label'].split(' > ')[:6],
            'basicCategory': None, 'confidence': None,
            'positionMethod': 'coordenada_publicada_por_un_directorio_privado_no_entrada_verificada',
            'dataLevel': 'DIRECTORIO_COLABORATIVO_SIN_ACTUALIZAR' if stale else 'DIRECTORIO_COLABORATIVO',
            'phones': [], 'emails': [], 'websites': [], 'socials': [],
            'warnings': ([f"sin_actualizar_desde_{row['refreshed'][:4]}"] if stale else [])
                        + ['directorio_colaborativo_no_confirma_local_abierto']
                        + (['familia_por_mapa_escrito'] if row['written'] else ['familia_por_voto_del_corpus']),
            'sourceDatasetUrl': DATASET_URI, 'sourceRecordUrl': f"https://foursquare.com/v/{row['id']}",
            'snapshotTakenAt': args.retrieved,
            'sourceTags': {k: v for k, v in {'categoriaFoursquare': row['label'], 'creado': row['created'] or '',
                                             'actualizado': row['refreshed']}.items() if v},
            'openingHours': None,
            'resemblesHeldPlace': {'placeId': resembles[1]['placeId'], 'name': resembles[1]['name'][:300],
                                   'metres': round(resembles[0])} if resembles else None,
            'licence': 'Apache-2.0; Foursquare Open Source Places', 'observationId': f"fsq:{row['id']}",
        })

    places.sort(key=lambda place: place['placeId'])
    provenance = {
        'publishers': ['Foursquare Open Source Places'], 'release': '2026-09-15',
        'extractionDate': args.retrieved[:10],
        # Otra huella que la de salud: el mismo archivo, otra entrega, otro artefacto.
        'deliverySha256': hashlib.sha256((sha256(args.extract) + ':resto').encode()).hexdigest(),
        'deliveryReportSha256': hashlib.sha256(json.dumps(decided, sort_keys=True).encode()).hexdigest(),
        'deliveryUri': DATASET_URI, 'upstreamDatasets': [DATASET_URI], 'licences': ['Apache-2.0'],
        'geofenceMethod': 'country_polygon', 'countryCode': 'BO', 'catalogueFamilies': len(catalogue),
    }
    OUT.mkdir(parents=True, exist_ok=True)
    for old in OUT.glob('*.json'):
        old.unlink()
    for index in range(0, len(places), PIECE):
        (OUT / f'fsq-poi-{index // PIECE:03d}.json').write_text(
            json.dumps({'dataset': 'bolivia-national-poi-v3', 'provenance': provenance,
                        'places': places[index:index + PIECE]}, ensure_ascii=False, indent=1) + '\n',
            'utf-8', newline='\n')
    REPORT.parent.mkdir(parents=True, exist_ok=True)
    REPORT.write_text(json.dumps(already, ensure_ascii=False, indent=1) + '\n', 'utf-8', newline='\n')
    print(json.dumps({
        'lugares': len(places), 'descartados': dict(dropped), 'categorias_con_familia': len(decided),
        'sin_actualizar_antes_de_2020': sum(1 for p in places if p['dataLevel'].endswith('SIN_ACTUALIZAR')),
        'familias_top': collections.Counter(p['entityFamily'] for p in places).most_common(15),
        'grupos': collections.Counter(p['entityGroup'] for p in places).most_common(12),
    }, ensure_ascii=False, indent=1))


if __name__ == '__main__':
    main()
