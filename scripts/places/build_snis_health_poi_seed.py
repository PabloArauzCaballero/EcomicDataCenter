#!/usr/bin/env python3
"""Construye `bolivia-snis-health-poi`: los establecimientos de salud que registra el Ministerio.

    python scripts/places/build_snis_health_poi_seed.py \
      --structure-dir <e>/csv --structure-archive <e>/Estructura_2026.zip \
      --sus-kml <e>/sus-adscripcion.kml --msyd-dbf <e>/centros_de_salud.dbf \
      --msyd-shp <e>/centros_de_salud.shp --pbf <e>/bolivia-260922.osm.pbf \
      --adm3 <e>/bol_admin3.geojson --retrieved 2026-09-27T21:45:00Z

Por qué hacía falta: el corpus tenía 116 centros de salud y ningún puesto de
salud; la red pública de primer nivel casi no estaba. El registro que la enumera
es la «estructura de establecimientos» del SNIS-VE (`DEPTOSESTR_2026.ves`: 5.248
establecimientos, 4.354 sin baja lógica). El porqué de cada regla, con lo medido,
está en `docs/runbooks/snis-health-load.md`.

El registro no trae coordenadas. Se toman, en este orden y solo si caen dentro
del municipio que el propio registro declara (tolerancia `EDGE_KM`): el mapa del
SUS del Ministerio; su capa de 2001-2008 en HDX; y, solo en lo rural, la
comunidad homónima de OpenStreetMap (mediana del error 0,48 km, marcada).

No se carga, y se cuenta: lo que tiene baja lógica; las clases que no atienden
al público (IDIF, IDE, CCESD, aislamiento); lo que queda sin coordenada
comprobable; y lo que YA está en el corpus con el mismo nombre (`SAME_M`, o
`SAME_APPROX_M` si la posición es aproximada): el tablero no mira
`resemblesHeldPlace` y lo mostraría dos veces. Esos pares van a
`artifacts/snis-health-already-held.json`. Del registro se descartan el
responsable (una persona) y el teléfono (en las postas, el celular del auxiliar).
"""

from __future__ import annotations

import argparse
import collections
import hashlib
import json
from pathlib import Path

from health_sources import (Grid, folded, read_communities, read_csv, read_dbf, read_held, read_shp_points,
                            read_sus_map)
from snis_registry import (CARE_WORD, FAMILY_BY_CLASS, HEALTH_GROUPS, LEVEL, NOT_PUBLIC_CARE, PERSON, SUBSECTOR,
                           core, same_place, title, tokens)

ROOT = Path(__file__).resolve().parents[2]
BOOT = ROOT / 'src' / 'database' / 'seeds' / 'boot'
OUT = BOOT / 'bolivia-snis-health-poi'
REPORT = ROOT / 'artifacts' / 'snis-health-already-held.json'
CATALOGUE = Path(__file__).resolve().parent / 'catalogue' / 'bolivia-place-families.json'
MUNICIPALITIES = Path(__file__).resolve().parent / 'catalogue' / 'bolivia-municipalities.json'

STRUCTURE_URI = 'https://snis.minsalud.gob.bo/component/jdownloads/?task=download.send&id=1174&m=0'
SUS_MAP_URI = 'https://www.google.com/maps/d/kml?mid=1dbQVDkzZ9PxsIkBoPUurZ3vvQdujMREj&forcekml=1'
SUS_PAGE_URI = 'https://www.minsalud.gob.bo/3590-busque-en-su-zona-el-centro-de-salud-mas-cercano-con-google-maps'
MSYD_URI = 'https://data.humdata.org/dataset/bolivia-health'
PIECE = 1200
EDGE_KM = 3.0
STACKED = 3
SAME_M = 300
SAME_APPROX_M = 3000
RESEMBLE_M = 150

def sha256(path: Path) -> str:
    return hashlib.sha256(path.read_bytes()).hexdigest()


def main() -> None:
    parser = argparse.ArgumentParser()
    for name in ('structure-dir', 'structure-archive', 'sus-kml', 'msyd-dbf', 'msyd-shp', 'pbf', 'adm3'):
        parser.add_argument(f'--{name}', required=True, type=Path)
    parser.add_argument('--retrieved', required=True)
    args = parser.parse_args()

    from shapely.geometry import Point, shape  # dependencia ya usada por assign_place_municipality.py

    catalogue = {row['code']: row for row in json.loads(CATALOGUE.read_text('utf-8'))['familias']}
    municipalities = {row['code']: row for row in json.loads(MUNICIPALITIES.read_text('utf-8'))['municipalities']}
    polygons = {f['properties']['adm3_pcode'][2:]: shape(f['geometry'])
                for f in json.loads(args.adm3.read_text('utf-8'))['features']}

    structure = args.structure_dir
    version = read_csv(structure / 't_version_tx.csv')[0]
    registry = {row['codestabl']: row for row in read_csv(structure / 'estblmto2005.csv')}
    managed = read_csv(structure / 'EstabGest2005.csv')
    classes = {row['codclsest']: row for row in read_csv(structure / 'clsestab2005.csv')}
    institutions = {row['codinstit']: row for row in read_csv(structure / 't_instit_tx.csv')}
    networks = {row['codarea']: row['nomarea'] for row in read_csv(structure / 'area2005.csv')}
    snis_municipalities = {row['codmunicip']: row['nommunicip'] for row in read_csv(structure / 'municipio2005.csv')}

    sus = read_sus_map(args.sus_kml)
    sus_by_municipality, sus_by_department = collections.defaultdict(list), collections.defaultdict(list)
    for row in sus:
        sus_by_municipality[(row['department'], folded(row['municipality']), core(row['name']))].append(row)
        sus_by_department[(row['department'], core(row['name']))].append(row)
    stacked = collections.Counter(row['point'] for row in sus)

    msyd = collections.defaultdict(list)
    for row, point in zip(read_dbf(args.msyd_dbf), read_shp_points(args.msyd_shp)):
        if point:
            msyd[(row['CODMUNI'].zfill(6), core(row['ESTSALUD']))].append({**row, 'point': point})

    communities = collections.defaultdict(list)
    for row in read_communities(args.pbf):
        for name in {row['name'], row.get('alt') or ''} - {''}:
            communities[folded(name)].append(row)

    held = read_held(BOOT, OUT, lambda place: (place.get('entityGroup') or '') in HEALTH_GROUPS)
    held_grid = Grid(held)

    def km_outside(code: str, point: tuple[float, float]) -> float | None:
        polygon = polygons.get(code)
        if polygon is None:
            return None
        spot = Point(point)
        return 0.0 if polygon.contains(spot) else polygon.boundary.distance(spot) * 111.32

    def locate(row: dict, code: str, rural: bool) -> tuple[str, tuple[float, float], list[str], dict] | None:
        department, name = int(code[:2]), row['nomestabl']
        municipality = folded(snis_municipalities.get(row['codmunicip']))
        candidates = []
        matches = sus_by_municipality.get((department, municipality, core(name)), [])
        if len(matches) == 1:
            candidates.append(('coordenada_del_mapa_sus_del_ministerio', matches[0]['point'], [], {}))
        elif not matches:
            matches = sus_by_department.get((department, core(name)), [])
            if len(matches) == 1:
                candidates.append(('coordenada_del_mapa_sus_del_ministerio', matches[0]['point'],
                                   ['mapa_sus_declara_otro_municipio'],
                                   {'municipioEnMapaSus': matches[0]['municipality']}))
        matches = msyd.get((code, core(name)), [])
        if len(matches) == 1:
            candidates.append(('coordenada_de_la_capa_msyd_2001_2008', matches[0]['point'],
                               ['coordenada_antigua_del_ministerio_2001_2008'], {}))
        if rural:
            polygon = polygons.get(code)
            hits = {}
            for label in {core(name), folded(registry.get(row['codestabl'], {}).get('localidad'))} - {''}:
                for place in communities.get(label, []):
                    if polygon is not None and polygon.contains(Point(place['point'])):
                        hits[place['id']] = place
            if len(hits) == 1:
                place = next(iter(hits.values()))
                candidates.append(('centro_de_la_comunidad_osm_homonima', place['point'],
                                   ['ubicacion_aproximada_centro_de_la_comunidad'],
                                   {'comunidadOsm': f"node/{place['id']}", 'comunidadOsmTipo': place['place']}))
        for method, point, warnings, tags in candidates:
            if stacked.get(point, 0) >= STACKED and method.startswith('coordenada_del_mapa_sus'):
                continue
            outside = km_outside(code, point)
            if outside is not None and outside <= EDGE_KM:
                return method, point, warnings + (['coordenada_a_menos_de_3_km_fuera_del_municipio'] if outside else []), tags
        return None

    dropped, already = collections.Counter(), []
    places = []
    for row in managed:
        if row['bajalogica'] != 'N':
            dropped['baja_logica_en_la_gestion'] += 1
            continue
        klass = classes.get(row['codclsest'], {}).get('nomclsest', '').strip()
        if klass.upper() in NOT_PUBLIC_CARE:
            dropped['clase_que_no_atiende_al_publico'] += 1
            continue
        institution = institutions.get(row['codinstit'], {})
        subsector = SUBSECTOR.get(institution.get('codsubsec', ''), 'Sin subsector')
        family = 'CAJA_DE_SALUD' if subsector == 'Seguridad social' else FAMILY_BY_CLASS.get(klass.upper())
        if family is None:
            raise SystemExit(f'clase del SNIS sin familia: {klass!r}')
        name = row['nomestabl']
        if PERSON.match(folded(name)) and not CARE_WORD.search(folded(name)):
            dropped['nombre_de_persona_sola'] += 1
            continue
        code = row['codmunicip'].zfill(6)
        rural = row['codUrbRur'] == 'R'
        located = locate(row, code, rural)
        if located is None:
            dropped['sin_coordenada_comprobable'] += 1
            continue
        method, point, warnings, tags = located
        approximate = method == 'centro_de_la_comunidad_osm_homonima'
        near = held_grid.near(point, SAME_APPROX_M if approximate else SAME_M)
        twin = next(((d, h) for d, h in near if same_place(name, h['name'], d, approximate)), None)
        if twin:
            already.append({'codigoSnis': row['codestabl'], 'nombre': name, 'placeId': twin[1]['placeId'],
                            'nombreGuardado': twin[1]['name'], 'metros': round(twin[0])})
            dropped['ya_estaba_en_el_corpus'] += 1
            continue
        resembles = next(((d, h) for d, h in near if d <= RESEMBLE_M
                          and len(tokens(name) & tokens(h['name'])) * 2 >= max(1, len(tokens(name)))), None)
        municipality = municipalities.get(code)
        entry = catalogue[family]
        stored = registry.get(row['codestabl'], {})
        category = classes.get(row['codclsest'], {}).get('codcatest', '')
        places.append({
            'placeId': f"snis:establecimiento:{row['codestabl']}",
            'publisherRecordId': row['codestabl'],
            'publisher': 'Ministerio de Salud y Deportes (SNIS-VE)',
            'name': title(name)[:300],
            'locality': municipality['name'] if municipality else None,
            'department': municipality['department'] if municipality else None,
            'address': title(stored.get('direccion') or '')[:300] or None,
            'latitude': round(point[1], 7),
            'longitude': round(point[0], 7),
            'entityGroup': entry['group'],
            'entityFamily': family,
            'commercialRole': entry['commercial_role'],
            'isRegulated': bool(entry['is_regulated']),
            'officialValidationSource': entry['official_validation_source'],
            'validationPriority': 'HIGH',
            'genericFamily': False,
            'classificationMethod': 'actividad_declarada_por_el_regulador_en_su_registro',
            'categoryKey': klass,
            'taxonomyHierarchy': [],
            'basicCategory': None,
            'confidence': None,
            'positionMethod': method,
            'dataLevel': 'REGISTRO_SANITARIO_DIRECCION_DECLARADA',
            'phones': [],
            'emails': [],
            'websites': [],
            'socials': [],
            'warnings': warnings,
            'sourceDatasetUrl': STRUCTURE_URI,
            'sourceRecordUrl': None,
            'snapshotTakenAt': args.retrieved,
            'sourceTags': {k: v for k, v in {
                'codigoSnis': row['codestabl'],
                'claseSnis': klass,
                'nivel': LEVEL.get(category, ''),
                'subsector': subsector,
                'institucion': institution.get('NOMINSTIT', ''),
                'ambito': 'Rural' if rural else 'Urbano',
                'camas': row.get('num_camas', ''),
                'redDeSalud': networks.get(row['codarea'], ''),
                'localidadDeclarada': stored.get('localidad', ''),
                'municipioSnis': snis_municipalities.get(row['codmunicip'], ''),
                'gestion': row['idgestion'],
                'versionEstructura': version['version'],
                **tags,
            }.items() if v},
            'openingHours': None,
            'resemblesHeldPlace': {'placeId': resembles[1]['placeId'], 'name': resembles[1]['name'][:300],
                                   'metres': round(resembles[0])} if resembles else None,
            'licence': ('sin_licencia_abierta_expresa_verificada; registro SNIS-VE, Ministerio de Salud'
                        + ('; comunidad: OpenStreetMap ODbL-1.0' if approximate else '')),
            'observationId': f"snis:establecimiento:{row['codestabl']}",
        })

    places.sort(key=lambda place: place['publisherRecordId'])
    provenance = {
        'publishers': ['Ministerio de Salud y Deportes (SNIS-VE)'],
        # El registro fecha su versión «1/1/2026 00:00:00» (día/mes/año); el cargador la lee ISO.
        'release': '{2}-{1:0>2}-{0:0>2}'.format(*version['fecha'].split(' ')[0].split('/')),
        'extractionDate': args.retrieved[:10],
        'deliverySha256': sha256(args.structure_archive),
        'deliveryReportSha256': sha256(args.sus_kml),
        'deliveryUri': STRUCTURE_URI,
        'upstreamDatasets': [STRUCTURE_URI, SUS_MAP_URI, SUS_PAGE_URI, MSYD_URI,
                             'https://download.geofabrik.de/south-america/bolivia-260922.osm.pbf'],
        'licences': ['sin_licencia_abierta_expresa_verificada', 'ODbL-1.0'],
        'geofenceMethod': 'declared_municipality',
        'countryCode': 'BO',
        'catalogueFamilies': len(catalogue),
    }
    OUT.mkdir(parents=True, exist_ok=True)
    for old in OUT.glob('*.json'):
        old.unlink()
    for index in range(0, len(places), PIECE):
        (OUT / f'snis-health-poi-{index // PIECE:03d}.json').write_text(
            json.dumps({'dataset': 'bolivia-national-poi-v3', 'provenance': provenance,
                        'places': places[index:index + PIECE]}, ensure_ascii=False, indent=1) + '\n',
            'utf-8', newline='\n')
    REPORT.parent.mkdir(parents=True, exist_ok=True)
    REPORT.write_text(json.dumps(already, ensure_ascii=False, indent=1) + '\n', 'utf-8', newline='\n')
    print(json.dumps({
        'registro': len(managed), 'lugares': len(places), 'descartados': dict(dropped),
        'familias': dict(collections.Counter(p['entityFamily'] for p in places)),
        'posicion': dict(collections.Counter(p['positionMethod'] for p in places)),
        'parecidos_marcados': sum(1 for p in places if p['resemblesHeldPlace']),
        'sin_localidad': sum(1 for p in places if p['locality'] is None),
    }, ensure_ascii=False, indent=1))


if __name__ == '__main__':
    main()
