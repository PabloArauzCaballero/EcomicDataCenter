#!/usr/bin/env python3
"""Construye `bolivia-agemed-pharmacies-poi`: las farmacias de AGEMED que la primera carga dejó fuera.

    python scripts/places/build_agemed_pharmacies_seed.py \
      --sheets <e>/agemed_xlsx --adm3 <e>/bol_admin3.geojson --retrieved 2026-09-27T21:30:00Z

AGEMED publica su registro de farmacias en dieciocho hojas, una por departamento
y ámbito (`archivos_vigilancia/farmacias/farmacias_<depto>_<urbana|rural>.xlsx`,
«actualizado al 12 septiembre 2026»). Tienen 7.001 filas. La entrega del
2026-09-21 (`bolivia-establishments-registry-poi`) cargó 4.812: llegó ya
filtrada a los tipos privados y sin 1.300 privadas más, sin motivo escrito. Se
notaba por departamento: La Paz 967 de 1.697, Chuquisaca 200 de 552, Pando 46
de 134, y ni una farmacia pública, municipal ni de las cajas.

Este constructor relee las mismas hojas (el SHA-256 de las dieciocho coincide
con el que guarda la siembra anterior) y escribe solo lo que falta. Las reglas:

- Una fila ya cargada se reconoce por su origen exacto, `<hoja>:fila:<n>`, y no
  se vuelve a escribir.
- Lo que ya está en el corpus por otra vía (OpenStreetMap, Overture) no entra:
  una farmacia guardada a menos de `SAME_M` metros con el mismo nombre, o a
  menos de `TOUCHING_M` con al menos la mitad de las palabras. El tablero no
  mira `resemblesHeldPlace` y la mostraría dos veces. La lista va a
  `artifacts/agemed-pharmacies-already-held.json`.
- La coordenada tiene que caer dentro del municipio que declara la fila (con
  `EDGE_KM` de tolerancia); si la fila no nombra un municipio conocido, dentro de
  su departamento. Coordenada en cero o fuera de él: fuera, sin geocodificar.
- Tres o más farmacias distintas en el mismo punto exacto: punto de relleno.
- Distribuidoras, laboratorios y «no definido» no son farmacias: fuera.
- Se descartan regentes (personas), teléfonos, celulares, NIT y correos, por la
  misma razón que la carga anterior: el 84 % son farmacias unipersonales y la
  hoja no concede licencia para redistribuir datos de contacto.
"""

from __future__ import annotations

import argparse
import collections
import hashlib
import json
import math
import re
from pathlib import Path
from urllib.parse import quote

from health_sources import Grid, folded, read_held

ROOT = Path(__file__).resolve().parents[2]
BOOT = ROOT / 'src' / 'database' / 'seeds' / 'boot'
OUT = BOOT / 'bolivia-agemed-pharmacies-poi'
REPORT = ROOT / 'artifacts' / 'agemed-pharmacies-already-held.json'
CATALOGUE = Path(__file__).resolve().parent / 'catalogue' / 'bolivia-place-families.json'
MUNICIPALITIES = Path(__file__).resolve().parent / 'catalogue' / 'bolivia-municipalities.json'
SHEET_URI = 'https://www.agemed.gob.bo/archivos_vigilancia/farmacias/'
PIECE = 1200
EDGE_KM = 3.0
STACKED = 3
SAME_M = 100
TOUCHING_M = 25
RESEMBLE_M = 60
NOT_PHARMACY = re.compile(r'DISTRIBUIDORA|LABORATORIO|NO DEFINIDO')
DEPARTMENT_CODE = {'CHUQUISACA': '01', 'LA PAZ': '02', 'COCHABAMBA': '03', 'ORURO': '04', 'POTOSI': '05',
                   'TARIJA': '06', 'SANTA CRUZ': '07', 'BENI': '08', 'PANDO': '09'}
STOP = {'DE', 'DEL', 'LA', 'EL', 'LOS', 'LAS', 'Y', 'SAN', 'SANTA', 'FARMACIA', 'FARMACIAS', 'SUCURSAL', 'SUC'}


def sha256(path: Path) -> str:
    return hashlib.sha256(path.read_bytes()).hexdigest()


def tokens(name) -> set[str]:
    return {t for t in folded(name).split() if t not in STOP and len(t) > 1}


def as_float(value) -> float | None:
    try:
        number = float(str(value).replace(',', '.'))
    except (TypeError, ValueError):
        return None
    return number if math.isfinite(number) else None


def as_text(value) -> str:
    if value is None:
        return ''
    if hasattr(value, 'strftime'):
        return value.strftime('%Y-%m-%d')
    return re.sub(r'\s+', ' ', str(value)).strip()


def main() -> None:
    parser = argparse.ArgumentParser()
    parser.add_argument('--sheets', required=True, type=Path)
    parser.add_argument('--adm3', required=True, type=Path)
    parser.add_argument('--retrieved', required=True)
    args = parser.parse_args()

    import openpyxl
    from shapely.geometry import Point, shape
    from shapely.ops import unary_union

    catalogue = {row['code']: row for row in json.loads(CATALOGUE.read_text('utf-8'))['familias']}
    entry = catalogue['FARMACIA']
    municipalities = json.loads(MUNICIPALITIES.read_text('utf-8'))['municipalities']
    by_name = collections.defaultdict(list)
    for row in municipalities:
        for label in {row['name'], row['officialName'], row['layerName']}:
            by_name[(row['code'][:2], folded(label))].append(row)
    polygons = {f['properties']['adm3_pcode'][2:]: shape(f['geometry'])
                for f in json.loads(args.adm3.read_text('utf-8'))['features']}
    departments = {code: unary_union([p for c, p in polygons.items() if c.startswith(code)])
                   for code in DEPARTMENT_CODE.values()}

    loaded = {row['recordId'] for row in read_held(BOOT, OUT, lambda place: place.get('publisher') == 'AGEMED')}
    grid = Grid(read_held(BOOT, OUT, lambda place: place.get('entityFamily') == 'FARMACIA'), cell=0.002)

    records, hashes = [], {}
    for sheet in sorted(args.sheets.glob('farmacias_*.xlsx')):
        hashes[sheet.name] = sha256(sheet)
        rows = list(openpyxl.load_workbook(sheet, read_only=True, data_only=True).worksheets[0].iter_rows(values_only=True))
        header = [folded(cell) for cell in rows[3]]
        column = {name: header.index(name) for name in header if name}
        for number, row in enumerate(rows[4:], start=5):
            if not row or not row[0]:
                continue
            cell = lambda key: row[column[key]] if key in column and column[key] < len(row) else None  # noqa: E731
            records.append({
                'sheet': sheet.name, 'row': number, 'origin': f'{sheet.name}:fila:{number}',
                'name': as_text(cell('NOMBRE DE LA FARMACIA')), 'kind': as_text(cell('TIPO')),
                'address': as_text(cell('DIRECCION')), 'department': folded(cell('DEPARTAMENTO')),
                'municipality': folded(cell('MUNICIPIO')),
                'latitude': as_float(cell('LATITUD')), 'longitude': as_float(cell('LONGITUD')),
                'resolution': as_text(cell('NO DE RESOLUCION')), 'resolutionDate': as_text(cell('FECHA DE RESOLUCION')),
            })

    stacked = collections.defaultdict(set)
    for record in records:
        if record['latitude'] is not None and record['longitude'] is not None:
            stacked[(round(record['longitude'], 6), round(record['latitude'], 6))].add(folded(record['name']))

    dropped, already, seen, places = collections.Counter(), [], set(), []
    for record in records:
        if record['origin'] in loaded:
            dropped['ya_cargada_por_la_entrega_anterior'] += 1
            continue
        if NOT_PHARMACY.search(folded(record['kind'])):
            dropped['no_es_farmacia'] += 1
            continue
        twin_key = (folded(record['name']), folded(record['address']))
        if twin_key in seen:
            dropped['fila_repetida_en_la_hoja'] += 1
            continue
        seen.add(twin_key)
        lat, lon = record['latitude'], record['longitude']
        department = DEPARTMENT_CODE.get(record['department']) or DEPARTMENT_CODE.get(
            folded(record['sheet'].split('_')[1]))
        if lat is None or lon is None or (abs(lat) < 1 and abs(lon) < 1):
            dropped['sin_coordenada'] += 1
            continue
        point = (lon, lat)
        if len(stacked[(round(lon, 6), round(lat, 6))]) >= STACKED:
            dropped['punto_de_relleno'] += 1
            continue
        candidates = by_name.get((department, record['municipality']), [])
        municipality = candidates[0] if len(candidates) == 1 else None
        spot = Point(point)
        if municipality is None and record['municipality']:
            # «VILLA HUANUNI» es Huanuni y «SANTA ROSA DEL ABUNA» es Santa Rosa: el nombre
            # largo del registro no calza con la capa, pero el municipio que contiene el punto
            # comparte una palabra con él.
            around = next((row for row in municipalities if row['code'].startswith(department or '-')
                           and row['code'] in polygons and polygons[row['code']].contains(spot)), None)
            if around and tokens(record['municipality']) & (tokens(around['name']) | tokens(around['officialName'])):
                municipality = around
        area = polygons.get(municipality['code']) if municipality else departments.get(department or '')
        if area is None or (not area.contains(spot) and area.boundary.distance(spot) * 111.32 > EDGE_KM):
            dropped['coordenada_fuera_del_municipio_declarado' if municipality else 'coordenada_fuera_del_departamento'] += 1
            continue
        near = grid.near(point, SAME_M)
        name_tokens = tokens(record['name'])
        twin = next(((d, h) for d, h in near
                     if (name_tokens and name_tokens == tokens(h['name']))
                     or (d <= TOUCHING_M and len(name_tokens & tokens(h['name'])) * 2 >= max(1, len(name_tokens)))),
                    None)
        if twin:
            already.append({'origen': record['origin'], 'nombre': record['name'], 'placeId': twin[1]['placeId'],
                            'nombreGuardado': twin[1]['name'], 'metros': round(twin[0])})
            dropped['ya_estaba_en_el_corpus'] += 1
            continue
        resembles = next(((d, h) for d, h in near if d <= RESEMBLE_M and name_tokens & tokens(h['name'])), None)
        decimals = max(len(str(lat).split('.')[-1]), len(str(lon).split('.')[-1]))
        warnings = ['registro_sanitario_no_verifica_local_abierto']
        if decimals >= 9:
            warnings.append('coordenada_calculada_precision_no_declarable')
        if municipality is None:
            warnings.append('municipio_no_reconocido_validada_contra_el_departamento')
        place_id = 'agemed:farmacia:' + hashlib.sha256(record['origin'].encode()).hexdigest()[:24]
        places.append({
            'placeId': place_id,
            'publisherRecordId': record['origin'],
            'publisher': 'AGEMED',
            'name': record['name'][:300],
            'locality': municipality['name'] if municipality else None,
            'department': municipality['department'] if municipality else None,
            'address': record['address'][:300] or None,
            'latitude': lat,
            'longitude': lon,
            'entityGroup': entry['group'],
            'entityFamily': 'FARMACIA',
            'commercialRole': entry['commercial_role'],
            'isRegulated': bool(entry['is_regulated']),
            'officialValidationSource': entry['official_validation_source'],
            'validationPriority': 'HIGH',
            'genericFamily': False,
            'classificationMethod': 'tipo_declarado_por_el_regulador_sanitario',
            'categoryKey': record['kind'],
            'taxonomyHierarchy': [],
            'basicCategory': None,
            'confidence': None,
            'positionMethod': 'coordenada_publicada_por_el_regulador_no_entrada_verificada',
            'dataLevel': 'REGISTRO_SANITARIO_DIRECCION_DECLARADA',
            'phones': [],
            'emails': [],
            'websites': [],
            'socials': [],
            'warnings': warnings,
            'sourceDatasetUrl': SHEET_URI + quote(record['sheet']),
            'sourceRecordUrl': None,
            'snapshotTakenAt': args.retrieved,
            'sourceTags': {k: v for k, v in {
                'tipo_establecimiento': record['kind'],
                'resolucion': record['resolution'],
                'fecha_resolucion': record['resolutionDate'],
                'fila_excel': str(record['row']),
                'municipio_declarado': record['municipality'],
                'sha256_xlsx': hashes[record['sheet']],
            }.items() if v},
            'openingHours': None,
            'resemblesHeldPlace': {'placeId': resembles[1]['placeId'], 'name': resembles[1]['name'][:300],
                                   'metres': round(resembles[0])} if resembles else None,
            'licence': 'sin_licencia_abierta_expresa_verificada; lista publica de farmacias AGEMED',
            'observationId': place_id,
        })

    if len({p['placeId'] for p in places}) != len(places):
        raise SystemExit('dos filas con el mismo placeId')
    places.sort(key=lambda place: (place['publisherRecordId'].split(':')[0], int(place['publisherRecordId'].split(':')[-1])))
    provenance = {
        'publishers': ['AGEMED'],
        'release': '2026-09-12',
        'extractionDate': args.retrieved[:10],
        'deliverySha256': hashlib.sha256(json.dumps(hashes, sort_keys=True).encode()).hexdigest(),
        'deliveryReportSha256': hashlib.sha256(json.dumps(sorted(loaded)).encode()).hexdigest(),
        'deliveryUri': SHEET_URI,
        'upstreamDatasets': [SHEET_URI + quote(name) for name in sorted(hashes)],
        'licences': ['sin_licencia_abierta_expresa_verificada'],
        'geofenceMethod': 'declared_municipality',
        'countryCode': 'BO',
        'catalogueFamilies': len(catalogue),
    }
    OUT.mkdir(parents=True, exist_ok=True)
    for old in OUT.glob('*.json'):
        old.unlink()
    for index in range(0, len(places), PIECE):
        (OUT / f'agemed-pharmacies-poi-{index // PIECE:03d}.json').write_text(
            json.dumps({'dataset': 'bolivia-national-poi-v3', 'provenance': provenance,
                        'places': places[index:index + PIECE]}, ensure_ascii=False, indent=1) + '\n',
            'utf-8', newline='\n')
    REPORT.parent.mkdir(parents=True, exist_ok=True)
    REPORT.write_text(json.dumps(already, ensure_ascii=False, indent=1) + '\n', 'utf-8', newline='\n')
    print(json.dumps({
        'filas': len(records), 'lugares': len(places), 'descartados': dict(dropped),
        'por_tipo': dict(collections.Counter(p['categoryKey'] for p in places).most_common()),
        'por_departamento': dict(collections.Counter(p['department'] for p in places)),
        'parecidos_marcados': sum(1 for p in places if p['resemblesHeldPlace']),
        'sin_localidad': sum(1 for p in places if p['locality'] is None),
    }, ensure_ascii=False, indent=1))


if __name__ == '__main__':
    main()
