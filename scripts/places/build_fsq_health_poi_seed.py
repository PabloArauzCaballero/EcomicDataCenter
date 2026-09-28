#!/usr/bin/env python3
"""Construye `bolivia-fsq-health-poi`: los lugares de salud de Foursquare que el corpus no tenía.

    python scripts/places/build_fsq_health_poi_seed.py \
      --extract <e>/fsq_bolivia_2026-09-15.parquet --adm0 <e>/bol_admin0.geojson \
      --retrieved 2026-09-28T02:30:00Z

El extracto son las 36.706 filas con `country = 'BO'` de Foursquare Open Source Places
(release 2026-09-15, Hugging Face `foursquare/fsq-os-places`, Apache-2.0). Salud son unas
1.600 y la mayoría ya estaba en el corpus. Ver `docs/runbooks/fsq-health-load.md`.

Foursquare es un directorio colaborativo: lo crean usuarios al hacer check-in, y en
Bolivia casi nadie lo actualiza (el 70 % no se toca desde antes de 2020). Por eso:

- No entra lo cerrado ni lo que Foursquare marca como inexistente, duplicado, privado,
  inapropiado o para borrar, ni lo que cae fuera de Bolivia.
- No entra un nombre genérico («Dentista», «Consultorio Odontológico»): no nombra ningún
  local; ni un nombre que es solo una persona («Dr. …»), por la regla de las cargas de salud.
- Lo que no se actualiza desde antes de `STALE_BEFORE` solo entra si su nombre dice qué es
  (farmacia, clínica, laboratorio…): así caen los lugares de broma («Torturolandia» como
  centro médico). Entra con `dataLevel` propio, y el tablero lo marca «Confianza baja».
- Lo que ya está en el corpus (mismo nombre a menos de `SAME_M`, o nombre parecido a menos
  de `TOUCHING_M`) no entra; los pares van a `artifacts/fsq-health-already-held.json`.
- Dos filas de Foursquare con el mismo nombre a menos de `TWIN_M`: queda la más reciente.
- Los contactos no viajan: la mitad son consultorios de un solo profesional.
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
OUT = BOOT / 'bolivia-fsq-health-poi'
REPORT = ROOT / 'artifacts' / 'fsq-health-already-held.json'
CATALOGUE = Path(__file__).resolve().parent / 'catalogue' / 'bolivia-place-families.json'
DATASET_URI = 'https://huggingface.co/datasets/foursquare/fsq-os-places/tree/main/release/dt=2026-09-15'
PIECE = 1200
STALE_BEFORE = '2020'
SAME_M = 150
TOUCHING_M = 20
TWIN_M = 50
RESEMBLE_M = 60
BAD_FLAGS = {'closed', 'doesnt_exist', 'duplicate', 'privatevenue', 'inappropriate', 'delete'}

# La categoría más específica de Foursquare, a la familia que el catálogo ya tiene.
FAMILY_BY_CATEGORY = [
    (r'> Pharmacy$', 'FARMACIA'),
    (r'Dentist|Orthodont|Oral Surgeon|Pediatric Dentist', 'ODONTOLOGIA'),
    (r'Hospital|Emergency Room', 'HOSPITAL'),
    (r'Medical Lab|> Laboratory$|Research Laboratory', 'LABORATORIO_CLINICO'),
    (r'Veterinarian', 'VETERINARIA'),
    (r'Optometrist|Eyecare', 'OPTICA'),
    (r'Physical Therapy|Chiropractor|Rehabilitation', 'FISIOTERAPIA_REHABILITACION'),
    (r'Mental Health|Psycholog|Counsel', 'PSICOLOGIA_SALUD_MENTAL'),
    (r'Medical Center|Healthcare Clinic|Urgent Care|Maternity|Clinic$', 'CLINICA'),
    (r'Physician|Doctor|Nutritionist|Nurse|Alternative Medicine|Acupuncture|Healthcare Professional|'
     r'Weight Loss|Cardiolog|Dermatolog|Gynecolog|Pediatric|Obstetric', 'CONSULTORIO_MEDICO'),
]
GENERIC = {'DENTISTA', 'DENTISTAS', 'ODONTOLOGO', 'ODONTOLOGA', 'ODONTOLOGIA', 'CONSULTORIO', 'ODONTOLOGICO',
           'MEDICO', 'MEDICA', 'CLINICA', 'DENTAL', 'FARMACIA', 'HOSPITAL', 'LABORATORIO', 'VETERINARIA',
           'VETERINARIO', 'OPTICA', 'CENTRO', 'SALUD', 'DE', 'DEL', 'LA', 'EL', 'Y', 'EN', 'MI', 'CASA',
           'DOCTOR', 'DOCTORA', 'DR', 'DRA', 'PEDIATRA', 'GINECOLOGO', 'CONSULTA', 'MEDICINA', 'GENERAL',
           'ODONTO', 'DENTISTA', 'SANATORIO', 'POLICLINICO', 'POLICONSULTORIO', 'LAB', 'FISIOTERAPIA'}
PERSON = re.compile(r'^(DR|DRA|LIC|DOC|DOCTOR|DOCTORA)\b')
CARE_WORD = re.compile(r'(FARMAC|CLINIC|HOSPITAL|CENTRO|CONSULTORIO|LABORATORIO|LAB\b|MEDIC|SALUD|DENT|ODONT|'
                       r'OPTIC|VETERIN|POLICLIN|POLICONSULT|CAJA|PEDIATR|GINECO|FISIOTER|REHABILIT|PSICOLO|'
                       r'DIAGNOST|IMAGEN|SANATORIO|MATERNIDAD|BOTICA|CNS|CPS|INSTITUTO)')
STOP = {'DE', 'DEL', 'LA', 'EL', 'LOS', 'LAS', 'Y', 'FARMACIA', 'CLINICA', 'CONSULTORIO', 'CENTRO', 'DR', 'DRA',
        'DENTAL', 'ODONTOLOGICO', 'ODONTOLOGIA', 'MEDICO', 'HOSPITAL', 'SALUD', 'LABORATORIO', 'VETERINARIA',
        'SUCURSAL', 'SUC', 'BOLIVIA', 'BOLIVIANA', 'BOLIVIANO', 'SAN', 'SANTA', 'CRUZ', 'PAZ', 'SIERRA'}


def sha256(path: Path) -> str:
    return hashlib.sha256(path.read_bytes()).hexdigest()


def tokens(name: str) -> set[str]:
    return {t for t in folded(name).split() if t not in STOP and len(t) > 1}


def family_of(labels: list[str]) -> tuple[str, str] | None:
    """La primera categoría de salud de la fila y su familia; None si ninguna es de salud."""
    for label in labels or []:
        if not (label.startswith('Health and Medicine') or label.startswith('Retail > Pharmacy')
                or label.startswith('Retail > Eyecare')):
            continue
        for pattern, family in FAMILY_BY_CATEGORY:
            if re.search(pattern, label):
                return label, family
    return None


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
        f"""SELECT fsq_place_id, name, latitude, longitude, address, fsq_category_labels,
                   date_created, date_refreshed, date_closed, unresolved_flags
            FROM read_parquet('{args.extract.as_posix()}')""").fetchall()
    grid = Grid(read_held(BOOT, OUT, lambda place: True), cell=0.002)

    dropped, already, candidates = collections.Counter(), [], []
    for fsq_id, name, lat, lon, address, labels, created, refreshed, closed, flags in rows:
        classified = family_of(labels)
        if classified is None:
            continue
        label, family = classified
        name = re.sub(r'\s+', ' ', name or '').strip()
        plain = folded(name)
        if closed or set(flags or []) & BAD_FLAGS:
            dropped['cerrado_o_marcado_por_foursquare'] += 1
        elif lat is None or not country.contains(Point(lon, lat)):
            dropped['fuera_de_bolivia'] += 1
        elif not plain or set(plain.split()) <= GENERIC:
            dropped['nombre_generico'] += 1
        elif PERSON.match(plain) and not CARE_WORD.search(plain):
            dropped['nombre_de_persona_sola'] += 1
        elif (refreshed or '0') < STALE_BEFORE and not CARE_WORD.search(plain):
            dropped['viejo_y_el_nombre_no_dice_que_es'] += 1
        else:
            point = (lon, lat)
            near = grid.near(point, SAME_M)
            mine = tokens(name)
            twin = next(((d, h) for d, h in near if (mine and mine == tokens(h['name']))
                         or (d <= TOUCHING_M and mine & tokens(h['name']))), None)
            if twin:
                already.append({'fsq': fsq_id, 'nombre': name, 'placeId': twin[1]['placeId'],
                                'nombreGuardado': twin[1]['name'], 'metros': round(twin[0])})
                dropped['ya_estaba_en_el_corpus'] += 1
                continue
            candidates.append({'id': fsq_id, 'name': name, 'point': point, 'address': address, 'label': label,
                               'family': family, 'created': created, 'refreshed': refreshed or '',
                               'resembles': next(((d, h) for d, h in near if d <= RESEMBLE_M
                                                  and mine & tokens(h['name'])), None)})

    # Dos fichas del mismo local dentro de Foursquare: queda la actualizada más tarde.
    candidates.sort(key=lambda row: row['refreshed'], reverse=True)
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
            'placeId': f"fsq:{row['id']}",
            'publisherRecordId': row['id'],
            'publisher': 'Foursquare Open Source Places',
            'name': row['name'][:300],
            'locality': None,
            'department': None,
            'address': (row['address'] or '').strip()[:300] or None,
            'latitude': round(row['point'][1], 7),
            'longitude': round(row['point'][0], 7),
            'entityGroup': entry['group'],
            'entityFamily': row['family'],
            'commercialRole': entry['commercial_role'],
            'isRegulated': bool(entry['is_regulated']),
            'officialValidationSource': entry['official_validation_source'],
            'validationPriority': 'NORMAL',
            'genericFamily': False,
            'classificationMethod': 'categoria_foursquare_a_familia_existente',
            'categoryKey': row['label'][:120],
            'taxonomyHierarchy': [part for part in row['label'].split(' > ')][:6],
            'basicCategory': None,
            'confidence': None,
            'positionMethod': 'coordenada_publicada_por_un_directorio_privado_no_entrada_verificada',
            'dataLevel': 'DIRECTORIO_COLABORATIVO_SIN_ACTUALIZAR' if stale else 'DIRECTORIO_COLABORATIVO',
            'phones': [],
            'emails': [],
            'websites': [],
            'socials': [],
            'warnings': ([f"sin_actualizar_desde_{row['refreshed'][:4]}"] if stale else [])
                        + ['directorio_colaborativo_no_confirma_local_abierto'],
            'sourceDatasetUrl': DATASET_URI,
            'sourceRecordUrl': f"https://foursquare.com/v/{row['id']}",
            'snapshotTakenAt': args.retrieved,
            'sourceTags': {k: v for k, v in {'categoriaFoursquare': row['label'], 'creado': row['created'] or '',
                                             'actualizado': row['refreshed']}.items() if v},
            'openingHours': None,
            'resemblesHeldPlace': {'placeId': resembles[1]['placeId'], 'name': resembles[1]['name'][:300],
                                   'metres': round(resembles[0])} if resembles else None,
            'licence': 'Apache-2.0; Foursquare Open Source Places',
            'observationId': f"fsq:{row['id']}",
        })

    places.sort(key=lambda place: place['placeId'])
    provenance = {
        'publishers': ['Foursquare Open Source Places'],
        'release': '2026-09-15',
        'extractionDate': args.retrieved[:10],
        'deliverySha256': sha256(args.extract),
        'deliveryReportSha256': hashlib.sha256(json.dumps(dict(dropped), sort_keys=True).encode()).hexdigest(),
        'deliveryUri': DATASET_URI,
        'upstreamDatasets': [DATASET_URI],
        'licences': ['Apache-2.0'],
        'geofenceMethod': 'country_polygon',
        'countryCode': 'BO',
        'catalogueFamilies': len(catalogue),
    }
    OUT.mkdir(parents=True, exist_ok=True)
    for old in OUT.glob('*.json'):
        old.unlink()
    for index in range(0, len(places), PIECE):
        (OUT / f'fsq-health-poi-{index // PIECE:03d}.json').write_text(
            json.dumps({'dataset': 'bolivia-national-poi-v3', 'provenance': provenance,
                        'places': places[index:index + PIECE]}, ensure_ascii=False, indent=1) + '\n',
            'utf-8', newline='\n')
    REPORT.parent.mkdir(parents=True, exist_ok=True)
    REPORT.write_text(json.dumps(already, ensure_ascii=False, indent=1) + '\n', 'utf-8', newline='\n')
    print(json.dumps({
        'lugares': len(places), 'descartados': dict(dropped),
        'familias': dict(collections.Counter(p['entityFamily'] for p in places)),
        'sin_actualizar_antes_de_2020': sum(1 for p in places if p['dataLevel'] == 'DIRECTORIO_COLABORATIVO_SIN_ACTUALIZAR'),
        'parecidos_marcados': sum(1 for p in places if p['resemblesHeldPlace']),
    }, ensure_ascii=False, indent=1))


if __name__ == '__main__':
    main()
