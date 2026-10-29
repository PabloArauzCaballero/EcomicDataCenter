#!/usr/bin/env python3
"""Construye las siembras de lugares del barrido del 2026-10-27, una por entrega.

    python scripts/places/build_oct27_places_seeds.py --deliveries <dir>/deliveries/2026-10-27 all

`<dir>` es el contenido de las ramas `datos/2026-10-27-*` (cada entrega trae su README y su
`manifest.json` con el sha256 de cada archivo; el constructor lo comprueba antes de leer).
Ver `docs/runbooks/places-load-2026-10-27.md`.

Seis carpetas, en este orden, y cada una se cruza con todo lo guardado y con las anteriores
de la lista —nunca con las posteriores, para que reconstruir una no cambie lo que dice otra—:

1. `bolivia-overture-2610-poi`: lo que Overture 2026-10-21.0 trae de nuevo frente a la
   2026-09-23.0 (`compare_prev.status = nuevo`), con confianza 0,3 o más, con las mismas
   reglas y el mismo voto del corpus que `build_overture_refresh_seed.py`.
2. `bolivia-osm-2610-poi`: los objetos del extracto de Geofabrik del 26-oct que el corpus no
   tenía por identificador, solo de las etiquetas que el corpus ya archivó con una familia
   clara (voto de los lugares de OpenStreetMap ya cargados).
3. `bolivia-official-2610-poi`: oficinas de entidades del Estado (SEGIP, Impuestos, Aduana,
   ABC, ENTEL, Correos…), mercados municipales de La Paz, aeropuertos de NAABOL, estaciones de
   servicio y de GNV de la ANH que faltaban y puntos de atención de la ASFI nuevos.
4. `bolivia-yango-poi`: restaurantes y tiendas del catálogo público de Yango Deli.
5. `bolivia-facebook-poi`: páginas públicas de comercios con ubicación declarada.
6. `bolivia-geoportal-poi`: capas de establecimientos de los geoportales de La Paz (GAMLP) y
   Santa Cruz (Guía Urbana del GAMSCS).

Lo que NO se carga, y por qué, va en el runbook: directorios sin coordenadas (Páginas
Amarillas, boliviaempresas, CADECOCRUZ), PedidosYa (archivo de Wayback) y Uber Eats (2020),
y las capas de los geoportales con nombres de personas o sin nombre.

Privacidad (regla de todas las cargas): no viaja ningún teléfono ni correo —los de Overture y
Facebook son muchas veces el celular o el correo personal de quien administra la página—, ni
el vendedor legal ni el NIT de Yango, ni los instaladores de gas de la ANH (personas). La
dedup marca los parecidos (`resemblesHeldPlace`) y no fusiona nunca.
"""

from __future__ import annotations

import argparse
import collections
import gzip
import hashlib
import json
import re
from pathlib import Path

from health_sources import folded
from held_index import read_held, tokens

ROOT = Path(__file__).resolve().parents[2]
BOOT = ROOT / 'src' / 'database' / 'seeds' / 'boot'
CATALOGUE = Path(__file__).resolve().parent / 'catalogue' / 'bolivia-place-families.json'
MUNICIPALITIES = Path(__file__).resolve().parent / 'catalogue' / 'bolivia-municipalities.json'
PIECE = 1200
ORDER = ['bolivia-overture-2610-poi', 'bolivia-osm-2610-poi', 'bolivia-official-2610-poi',
         'bolivia-yango-poi', 'bolivia-facebook-poi', 'bolivia-geoportal-poi']
TWIN_M = 50
NOT_A_VOTE = {'OTRA_ENTIDAD', 'OV_SERVICES_AND_BUSINESS', 'LUGAR_SIN_TAXONOMIA'}
GENERIC = {'RESTAURANTE', 'RESTAURANT', 'TIENDA', 'MERCADO', 'IGLESIA', 'PLAZA', 'CANCHA', 'OFICINA',
           'PARQUEO', 'PARADA', 'COLEGIO', 'ESCUELA', 'BANCO', 'CAFE', 'BAR', 'HOTEL', 'HOSTAL', 'PARQUE',
           'PELUQUERIA', 'TALLER', 'MECANICO', 'LAVADERO', 'PANADERIA', 'POLLERIA', 'PENSION', 'KIOSCO',
           'KIOSKO', 'CASA', 'DE', 'DEL', 'LA', 'EL', 'LOS', 'LAS', 'Y', 'EN', 'CENTRO', 'SALON', 'EVENTOS',
           'FERIA', 'ALMACEN', 'MINIMARKET', 'SUPERMERCADO', 'LIBRERIA', 'FARMACIA', 'FOTOCOPIAS',
           'INTERNET', 'GARAJE', 'GARAGE', 'UNIVERSIDAD', 'GIMNASIO', 'GYM', 'HOSPITAL', 'CLINICA',
           'CONSULTORIO', 'DENTAL', 'BOLIVIA', 'SANTA', 'CRUZ', 'PAZ', 'COCHABAMBA'}


# ----------------------------------------------------------------------------- comunes

def sha256(path: Path) -> str:
    digest = hashlib.sha256()
    with path.open('rb') as handle:
        for block in iter(lambda: handle.read(1 << 20), b''):
            digest.update(block)
    return digest.hexdigest()


def rows(path: Path):
    with gzip.open(path, 'rt', encoding='utf-8') as handle:
        for line in handle:
            if line.strip():
                yield json.loads(line)


def verify(delivery: Path, files: list[str]) -> str:
    """Comprueba cada archivo contra el manifiesto de su entrega; devuelve el sha del manifiesto."""
    manifest = delivery / 'manifest.json'
    text = manifest.read_text('utf-8')
    for name in files:
        digest = sha256(delivery / name)
        if digest not in text:
            raise SystemExit(f'{delivery.name}/{name}: el sha256 {digest} no está en manifest.json')
    return sha256(manifest)


def catalogue() -> dict[str, dict]:
    return {row['code']: row for row in json.loads(CATALOGUE.read_text('utf-8'))['familias']}


def municipality_names() -> dict[str, str]:
    names = collections.defaultdict(set)
    for row in json.loads(MUNICIPALITIES.read_text('utf-8'))['municipalities']:
        names[folded(row['name'])].add(row['name'])
        names[folded(row['officialName'])].add(row['name'])
    # Seis nombres se repiten en dos departamentos: ahí decide el polígono.
    return {key: next(iter(value)) for key, value in names.items() if len(value) == 1}


def generic_name(name: str) -> bool:
    plain = folded(name)
    return not plain or set(plain.split()) <= GENERIC


def text(value, limit: int) -> str | None:
    value = re.sub(r'\s+', ' ', str(value or '')).strip()
    return value[:limit] or None


def tags(values: dict) -> dict[str, str]:
    return {key: (value if isinstance(value, str) else json.dumps(value, ensure_ascii=False))[:2000]
            for key, value in values.items() if value not in (None, '', [], {})}


def in_bolivia(lat, lon) -> bool:
    return lat is not None and lon is not None and -23 <= lat <= -9 and -70 <= lon <= -57


class Builder:
    """Lo común a las seis: el índice de lo guardado, la dedup y la escritura."""

    def __init__(self, directory: str) -> None:
        self.directory = directory
        self.catalogue = catalogue()
        self.held = read_held(BOOT, skip=ORDER[ORDER.index(directory):])
        self.dropped: collections.Counter = collections.Counter()
        self.places: list[dict] = []
        self.own: dict[tuple[int, int], list[tuple]] = collections.defaultdict(list)
        self.already: list[dict] = []

    def novel(self, place_id: str, name: str, lon: float, lat: float) -> tuple[bool, dict | None]:
        """Si el lugar no está ya guardado, y el parecido a marcar si lo hay."""
        if place_id in self.held.ids:
            self.dropped['ya_estaba_por_identificador'] += 1
            return False, None
        twin = self.held.twin(name, lon, lat)
        if twin:
            self.dropped['ya_estaba_por_nombre_y_distancia_150m'] += 1
            self.already.append({'placeId': place_id, 'nombre': name, 'guardado': twin[1][0],
                                 'metros': round(twin[0])})
            return False, None
        key = self.held.key(lon, lat)
        mine = tokens(name)
        for dx in (-1, 0, 1):
            for dy in (-1, 0, 1):
                for other in self.own.get((key[0] + dx, key[1] + dy), ()):
                    if mine and mine == other[1] and abs(other[2] - lon) < 0.0006 and abs(other[3] - lat) < 0.0006:
                        self.dropped['repetido_dentro_de_la_entrega'] += 1
                        return False, None
        self.own[key].append((place_id, mine, lon, lat))
        return True, self.held.resembles(name, lon, lat)

    def place(self, **values) -> None:
        family = values.pop('family')
        entry = self.catalogue[family]
        base = {
            'placeId': None, 'publisherRecordId': None, 'publisher': None, 'name': None, 'locality': None,
            'department': None, 'address': None, 'latitude': None, 'longitude': None,
            'entityGroup': entry['group'], 'entityFamily': family, 'commercialRole': entry['commercial_role'],
            'isRegulated': bool(entry['is_regulated']),
            'officialValidationSource': entry['official_validation_source'],
            'validationPriority': 'HIGH' if entry['is_regulated'] else 'NORMAL',
            'genericFamily': family.startswith('OV_'), 'classificationMethod': None, 'categoryKey': None,
            'taxonomyHierarchy': [], 'basicCategory': None, 'confidence': None, 'positionMethod': None,
            'dataLevel': None, 'phones': [], 'emails': [], 'websites': [], 'socials': [], 'warnings': [],
            'sourceDatasetUrl': None, 'sourceRecordUrl': None, 'snapshotTakenAt': None, 'sourceTags': None,
            'openingHours': None, 'resemblesHeldPlace': None, 'licence': None, 'observationId': None,
        }
        base.update(values)
        base['latitude'] = round(base['latitude'], 7)
        base['longitude'] = round(base['longitude'], 7)
        base['observationId'] = base['observationId'] or base['placeId'][:80]
        self.places.append(base)

    def write(self, prefix: str, provenance: dict) -> None:
        out = BOOT / self.directory
        out.mkdir(parents=True, exist_ok=True)
        for old in out.glob('*.json'):
            old.unlink()
        self.places.sort(key=lambda place: place['placeId'])
        provenance = {**provenance, 'geofenceMethod': provenance.get('geofenceMethod', 'country_polygon'),
                      'countryCode': 'BO', 'catalogueFamilies': len(self.catalogue),
                      'licences': sorted({place['licence'] for place in self.places})}
        for index in range(0, len(self.places), PIECE):
            (out / f'{prefix}-{index // PIECE:03d}.json').write_text(
                json.dumps({'dataset': 'bolivia-national-poi-v3', 'provenance': provenance,
                            'places': self.places[index:index + PIECE]}, ensure_ascii=False, indent=1) + '\n',
                'utf-8', newline='\n')
        report = ROOT / 'artifacts' / f'{self.directory}-ya-guardados.json'
        report.parent.mkdir(parents=True, exist_ok=True)
        report.write_text(json.dumps(self.already, ensure_ascii=False, indent=1) + '\n', 'utf-8', newline='\n')
        print(json.dumps({
            'carpeta': self.directory, 'lugares': len(self.places), 'descartados': dict(self.dropped),
            'parecidos_marcados': sum(1 for p in self.places if p['resemblesHeldPlace']),
            'familias': len({p['entityFamily'] for p in self.places}),
            'familias_top': collections.Counter(p['entityFamily'] for p in self.places).most_common(12),
        }, ensure_ascii=False))


# ----------------------------------------------------------------------------- 1. Overture

OVERTURE_RELEASE = '2026-10-21.0'
OVERTURE_URI = f's3://overturemaps-us-west-2/release/{OVERTURE_RELEASE}/theme=places/type=place/'
OVERTURE_FILE = 'overture-places-bolivia-2026-10-21.0.ndjson.gz'
DROPPED_CATEGORIES = {'historic_site'}  # en Bolivia son sobre todo condominios y edificios
# Donde el voto del corpus se equivoca a la vista: un consultorio no es un centro de imágenes.
OVERTURE_WRITTEN = {'doctors_office': 'CONSULTORIO_MEDICO'}


def overture(deliveries: Path) -> None:
    delivery = deliveries / 'overture'
    manifest = verify(delivery, [OVERTURE_FILE])
    b = Builder('bolivia-overture-2610-poi')
    votes: dict[str, collections.Counter] = collections.defaultdict(collections.Counter)
    for row in rows(delivery / OVERTURE_FILE):
        family = b.held.ids.get(f"overture:{row['source_id']}")
        if family and row['category_raw'] and family not in NOT_A_VOTE:
            votes[row['category_raw']][family] += 1

    def family_for(category: str, hierarchy: list[str]) -> tuple[str | None, bool]:
        if category in OVERTURE_WRITTEN:
            return OVERTURE_WRITTEN[category], False
        for depth, key in enumerate([category, *reversed(hierarchy[:-1])]):
            if key in votes:
                return votes[key].most_common(1)[0][0], depth > 0
            if f'OV_{key.upper()}' in b.catalogue:
                return f'OV_{key.upper()}', depth > 0
        return None, False

    for row in rows(delivery / OVERTURE_FILE):
        if (row.get('compare_prev') or {}).get('status') != 'nuevo':
            continue
        b.dropped['nuevos_frente_a_2026_09_23'] += 1
        confidence = row['confidence'] or 0
        category = row['category_raw']
        hierarchy = row.get('category_hierarchy') or []
        if confidence < 0.3:
            b.dropped['confianza_menor_a_0_3'] += 1
            continue
        if not category:
            b.dropped['sin_categoria_nativa'] += 1
            continue
        if category in DROPPED_CATEGORIES or (hierarchy and hierarchy[0] == 'geographic_entities'):
            b.dropped['no_es_un_establecimiento'] += 1
            continue
        if generic_name(row['name']):
            b.dropped['nombre_es_solo_la_actividad'] += 1
            continue
        family, from_parent = family_for(category, hierarchy)
        if family is None:
            b.dropped['categoria_sin_familia'] += 1
            continue
        place_id = f"overture:{row['source_id']}"
        ok, resembles = b.novel(place_id, row['name'], row['lon'], row['lat'])
        if not ok:
            continue
        b.place(
            family=family, placeId=place_id, publisherRecordId=row['source_id'],
            publisher='Overture Maps Foundation', name=text(row['name'], 300), locality=text(row['locality'], 160),
            address=text(row['address'], 300), latitude=row['lat'], longitude=row['lon'],
            genericFamily=from_parent or family.startswith('OV_'),
            classificationMethod='categoria_overture_por_familia_ya_asignada_en_el_corpus',
            categoryKey=category[:120], taxonomyHierarchy=[h[:120] for h in hierarchy][:6],
            basicCategory=text(row.get('basic_category'), 120), confidence=round(confidence, 4),
            dataLevel='B_REGISTRO_CARTOGRAFICO',
            websites=[w for w in (row.get('websites') or []) if 4 <= len(w) <= 2000][:5],
            socials=[s for s in (row.get('socials') or []) if 4 <= len(s) <= 500][:5],
            warnings=['nuevo_en_overture_2026_10_21',
                      'confianza_overture_baja_0_3_a_0_5' if confidence < 0.5
                      else 'confianza_overture_entre_0_5_y_0_6' if confidence < 0.6
                      else 'confianza_overture_0_6_o_mas'],
            sourceDatasetUrl=OVERTURE_URI, snapshotTakenAt=row['retrieved_at'],
            sourceTags=tags({'taxonomyPrimary': category, 'basicCategory': row.get('basic_category'),
                             'brand': row.get('brand_name'), 'actualizado': row.get('source_updated_at'),
                             'fuentes': ','.join(row.get('source_datasets') or [])}),
            resemblesHeldPlace=resembles, licence='CDLA-Permissive-2.0',
        )
    b.write('overture-2610-poi', {
        'publishers': ['Overture Maps Foundation'], 'release': OVERTURE_RELEASE, 'extractionDate': '2026-10-27',
        'deliverySha256': sha256(delivery / OVERTURE_FILE), 'deliveryReportSha256': manifest,
        'deliveryUri': OVERTURE_URI, 'upstreamDatasets': [OVERTURE_URI]})


# ----------------------------------------------------------------------------- 2. OpenStreetMap

OSM_FILE = 'osm-places-000.ndjson.gz'
OSM_URI = 'https://download.geofabrik.de/south-america/bolivia-latest.osm.pbf'
OSM_SNAPSHOT = '2026-10-26T21:24:46Z'
OSM_VOTE_MIN, OSM_VOTE_SHARE = 5, 0.6
# Lo que tiene un registro oficial que manda (ASFI cajeros y agencias, SIE colegios), y lo
# que no es un establecimiento aunque tenga nombre.
OSM_SKIP_KEYS = {'building', 'public_transport', 'highway', 'man_made'}
OSM_SKIP_TAGS = {'amenity=atm', 'amenity=bank', 'amenity=school', 'amenity=bureau_de_change',
                 'amenity=bench', 'amenity=parking_space', 'amenity=toilets', 'amenity=waste_disposal',
                 'amenity=shelter', 'amenity=grave_yard', 'tourism=attraction', 'tourism=viewpoint',
                 'tourism=artwork', 'tourism=information', 'leisure=garden', 'leisure=pitch'}


def osm(deliveries: Path) -> None:
    delivery = deliveries / 'osm'
    manifest = verify(delivery, [OSM_FILE])
    b = Builder('bolivia-osm-2610-poi')
    votes: dict[str, collections.Counter] = collections.defaultdict(collections.Counter)
    for row in rows(delivery / OSM_FILE):
        family = b.held.ids.get(f"osm:{row['source_id'].replace('/', ':')}")
        if family and family not in NOT_A_VOTE:
            votes[row['category_raw']][family] += 1
    decided = {}
    for tag, counter in votes.items():
        family, count = counter.most_common(1)[0]
        total = sum(counter.values())
        if total >= OSM_VOTE_MIN and count / total >= OSM_VOTE_SHARE and family in b.catalogue:
            decided[tag] = family

    for row in rows(delivery / OSM_FILE):
        place_id = f"osm:{row['source_id'].replace('/', ':')}"
        if place_id in b.held.ids:
            b.dropped['ya_estaba_por_identificador'] += 1
            continue
        tag = row['category_raw']
        if tag.split('=')[0] in OSM_SKIP_KEYS or tag in OSM_SKIP_TAGS:
            b.dropped['etiqueta_fuera_de_la_carga'] += 1
            continue
        if tag not in decided:
            b.dropped['etiqueta_sin_familia_clara_en_el_corpus'] += 1
            continue
        if generic_name(row['name']):
            b.dropped['nombre_es_solo_la_actividad'] += 1
            continue
        ok, resembles = b.novel(place_id, row['name'], row['lon'], row['lat'])
        if not ok:
            continue
        raw_tags = (row.get('raw') or {}).get('tags') or {}
        safe = {k: v for k, v in raw_tags.items()
                if not re.match(r'^(phone|mobile|fax|email|contact:(phone|mobile|email|fax|whatsapp))', k)}
        b.place(
            family=decided[tag], placeId=place_id, publisherRecordId=str(row['osm_id']),
            publisher='OpenStreetMap contributors', name=text(row['name'], 300),
            locality=text(row.get('addr_city'), 160),
            # La calle inferida (la más cercana a < 50 m) no es una dirección declarada.
            address=None if row.get('address_inferred') else text(row.get('address'), 300),
            latitude=row['lat'], longitude=row['lon'], genericFamily=decided[tag].startswith('OV_'),
            classificationMethod='etiqueta_osm_por_familia_ya_asignada_en_el_corpus', categoryKey=tag[:120],
            positionMethod='nodo_osm_original' if row['osm_type'] == 'node' else 'centro_bbox_objeto_osm_no_es_entrada',
            dataLevel='NOMBRE_ACTIVIDAD_Y_COORDENADAS',
            websites=[row['website']] if row.get('website') and 4 <= len(row['website']) <= 2000 else [],
            warnings=['etiqueta_osm_a_familia_por_voto_del_corpus'],
            sourceDatasetUrl=OSM_URI, sourceRecordUrl=row['source_url'], snapshotTakenAt=OSM_SNAPSHOT,
            sourceTags=tags(safe), openingHours=text(row.get('hours'), 400), resemblesHeldPlace=resembles,
            licence='ODbL-1.0',
        )
    b.write('osm-2610-poi', {
        'publishers': ['OpenStreetMap contributors'], 'release': '2026-10-26', 'extractionDate': '2026-10-27',
        'deliverySha256': sha256(delivery / OSM_FILE), 'deliveryReportSha256': manifest,
        'deliveryUri': OSM_URI, 'upstreamDatasets': [OSM_URI]})
    print(json.dumps({'etiquetas_con_familia': len(decided)}))


# ----------------------------------------------------------------------------- 3. Oficiales

# Cada directorio de oficinas: quién lo publica y en qué familia caen sus sedes.
OFFICES = {
    'abc_oficinas': ('ABC', 'OFICINA_GOBIERNO'),
    'aduana_oficinas': ('Aduana Nacional', 'ADUANA'),
    'ajam_oficinas': ('AJAM', 'OFICINA_GOBIERNO'),
    'asfi_oficinas': ('ASFI', 'OFICINA_GOBIERNO'),
    'att_oficinas': ('ATT', 'OFICINA_GOBIERNO'),
    'correos_agbc': ('AGBC (Correos de Bolivia)', 'CORREOS'),
    'entel_multicentros': ('ENTEL', 'TIENDA_OPERADOR_TELECOM'),
    'ibmetro_oficinas': ('IBMETRO', 'OFICINA_GOBIERNO'),
    'impuestos_oficinas': ('SIN (Impuestos Nacionales)', 'IMPUESTOS'),
    'insa_oficinas': ('INSO', 'OFICINA_GOBIERNO'),
    'lapaz_mercados': ('GAMLP (SIT La Paz)', 'MERCADO'),
    'mintrabajo_oficinas': ('Ministerio de Trabajo', 'OFICINA_GOBIERNO'),
    'naabol': ('NAABOL', 'AEROPUERTO'),
    'segip_oficinas': ('SEGIP', 'OFICINA_SEGIP'),
    'senarecom_oficinas': ('SENARECOM', 'OFICINA_GOBIERNO'),
    'seprec_oficinas': ('SEPREC', 'OFICINA_SEPREC'),
    'ylb_oficinas': ('YLB', 'OFICINA_GOBIERNO'),
}
# Solo las estaciones: las demás actividades de la lista de la ANH son importadores,
# instaladores de redes de gas y puestos de garrafas, muchas veces personas.
ANH_STATION_FAMILY = {'CLES': 'SURTIDOR', 'CGNES': 'SURTIDOR_GNV'}
ASFI_OFFICE_FAMILY_BY_ENTITY_TYPE = {1: 'BANCO_MULTIPLE', 3: 'COOPERATIVA_FINANCIERA', 10: 'BANCO_DESARROLLO_PRODUCTIVO',
                                     27: 'INSTITUCION_FINANCIERA_DESARROLLO', 74: 'BANCO_PYME',
                                     75: 'ENTIDAD_FINANCIERA_VIVIENDA', 9: 'CASA_CAMBIO', 55: 'REMESAS_PAGOS'}


def official(deliveries: Path) -> None:
    delivery = deliveries / 'oficiales'
    files = [f'{name}/{name}.ndjson.gz' for name in OFFICES] + [
        'anh_operadores/anh_operadores.ndjson.gz', 'asfi_puntos_atencion/asfi_puntos_atencion.ndjson.gz']
    manifest = verify(delivery, files)
    b = Builder('bolivia-official-2610-poi')
    names = municipality_names()
    upstream = set()

    for source, (publisher, family) in OFFICES.items():
        for row in rows(delivery / f'{source}/{source}.ndjson.gz'):
            if not in_bolivia(row['lat'], row['lon']):
                b.dropped['sin_coordenada'] += 1
                continue
            digest = hashlib.sha1(f"{source}:{row['source_id']}".encode()).hexdigest()[:24]
            place_id = f'estado:{source}:{digest}'
            ok, resembles = b.novel(place_id, row['name'], row['lon'], row['lat'])
            if not ok:
                continue
            name = row['name'] if source in ('lapaz_mercados', 'naabol', 'entel_multicentros') \
                else f"{publisher} - {row['name']}"
            upstream.add(row['source_url'])
            b.place(
                family=family, placeId=place_id, publisherRecordId=str(row['source_id'])[:200], publisher=publisher,
                name=text(name, 300), locality=text(row.get('municipality'), 160) if row.get('municipality') else None,
                department=text(row.get('department'), 80), address=text(row.get('address'), 300),
                latitude=row['lat'], longitude=row['lon'], genericFamily=False,
                classificationMethod='canal_declarado_por_la_entidad_en_su_propio_directorio',
                categoryKey=text(row['category_raw'], 120),
                positionMethod='coordenada_publicada_por_la_entidad_no_entrada_verificada',
                dataLevel='CONTACTO_Y_DIRECCION_PUBLICADOS',
                websites=[row['website']] if row.get('website') and 4 <= len(row['website']) <= 2000 else [],
                warnings=['directorio_de_la_propia_entidad'], sourceDatasetUrl=text(row['source_url'], 400),
                snapshotTakenAt=row['retrieved_at'],
                sourceTags=tags({'fuente': source, 'categoria': row['category_raw'],
                                 'actualizado': row.get('source_updated_at')}),
                openingHours=text(row.get('hours'), 400), resemblesHeldPlace=resembles,
                licence='Informacion publica de la entidad, sin licencia abierta declarada',
            )

    for row in rows(delivery / 'anh_operadores/anh_operadores.ndjson.gz'):
        code = row['source_id'].split(':', 1)[1]
        kind = re.sub(r'\d+$', '', code.split('-')[-1]) if code.startswith('ANH') else None
        if kind not in ANH_STATION_FAMILY:
            b.dropped['anh_no_es_estacion'] += 1
            continue
        if not in_bolivia(row['lat'], row['lon']):
            b.dropped['sin_coordenada'] += 1
            continue
        place_id = f'anh:estacion:{code}'
        ok, resembles = b.novel(place_id, row['name'], row['lon'], row['lat'])
        if not ok:
            continue
        upstream.add(row['source_url'])
        raw = row.get('raw') or {}
        b.place(
            family=ANH_STATION_FAMILY[kind], placeId=place_id, publisherRecordId=code, publisher='ANH',
            name=text(row['name'], 300), department=text(row.get('department'), 80),
            address=text(row.get('address'), 300), latitude=row['lat'], longitude=row['lon'], genericFamily=False,
            classificationMethod='actividad_declarada_por_el_regulador_en_su_registro',
            categoryKey=text(row['category_raw'], 120),
            positionMethod='coordenada_publicada_por_el_regulador_no_entrada_verificada',
            dataLevel='REGISTRO_DEL_REGULADOR_DIRECCION_DECLARADA',
            warnings=['licencia_del_regulador_no_verifica_estacion_abierta'],
            sourceDatasetUrl=text(row['source_url'], 400), snapshotTakenAt=row['retrieved_at'],
            sourceTags=tags({'actividad': row['category_raw'], 'licencia': raw.get('licencia'),
                             'productos': raw.get('productos')}),
            resemblesHeldPlace=resembles,
            licence='lista publica de operadores de la ANH; redistribucion no verificada',
        )

    for row in rows(delivery / 'asfi_puntos_atencion/asfi_puntos_atencion.ndjson.gz'):
        raw = row.get('raw') or {}
        if not raw.get('estado', True):
            b.dropped['asfi_punto_inactivo'] += 1
            continue
        if not in_bolivia(row['lat'], row['lon']):
            b.dropped['sin_coordenada'] += 1
            continue
        group = (raw.get('cgrupo') or '').strip()
        if group == 'CA':
            family = 'CAJERO_ATM'
        elif group == 'OE' and not folded(row['name']).startswith(folded(raw.get('entidad'))[:12]):
            # «Oficina externa» con nombre de comercio: un corresponsal, como en `bolivia-asfi-poi`.
            family = 'CORRESPONSAL_FINANCIERO'
        else:
            family = ASFI_OFFICE_FAMILY_BY_ENTITY_TYPE.get(raw.get('centidadTipo'), 'OV_FINANCIAL_SERVICE')
        place_id = f"asfi:paf:{row['source_id']}"
        ok, resembles = b.novel(place_id, row['name'], row['lon'], row['lat'])
        if not ok:
            continue
        upstream.add(row['source_url'])
        b.place(
            family=family, placeId=place_id, publisherRecordId=str(row['source_id']), publisher='ASFI',
            name=text(row['name'], 300), department=text(row.get('department'), 80),
            address=text(row.get('address'), 300), latitude=row['lat'], longitude=row['lon'],
            classificationMethod='actividad_declarada_por_el_regulador_en_su_registro',
            categoryKey=text(row['category_raw'], 120),
            positionMethod='coordenada_publicada_por_el_regulador_no_entrada_verificada',
            dataLevel='REGISTRO_DEL_REGULADOR_DIRECCION_DECLARADA',
            warnings=['punto_nuevo_en_la_api_de_la_asfi_2026_10_27'],
            sourceDatasetUrl=text(row['source_url'], 400), snapshotTakenAt=row['retrieved_at'],
            sourceTags=tags({'entidad': raw.get('entidad'), 'sigla': raw.get('tentidadSigla'),
                             'grupo': raw.get('desGrupo'), 'tipo': raw.get('tdescripcion'),
                             'modificado': raw.get('fechaModificacion')}),
            openingHours=text(row.get('hours'), 400), resemblesHeldPlace=resembles,
            licence='Informacion publica de la ASFI, sin licencia abierta declarada. Fuente: ASFI',
        )
    b.write('official-2610-poi', {
        'publishers': sorted({p['publisher'] for p in b.places}), 'release': '2026-10-27',
        'extractionDate': '2026-10-27', 'deliverySha256': manifest,
        'deliveryReportSha256': sha256(delivery / 'anh_operadores/anh_operadores.ndjson.gz'),
        'deliveryUri': 'https://github.com/PabloArauzCaballero/EcomicDataCenter/tree/datos/2026-10-27-oficiales',
        'upstreamDatasets': sorted(u for u in upstream if u)[:40] or ['https://www.anh.gob.bo/']})


# ----------------------------------------------------------------------------- 4. Yango Deli

YANGO_FILE = 'yango.ndjson.gz'
YANGO_URI = 'https://food.yango.com/api/v2/catalog'
YANGO_CUISINE = [  # la primera cocina que nombra decide; si ninguna, restaurante
    ('HELADO', 'HELADERIA'), ('SALTENA', 'SALTENERIA'), ('PANADERIA', 'PANADERIA_PASTELERIA'),
    ('POSTRES', 'PANADERIA_PASTELERIA'), ('CAFE', 'CAFE'), ('COMIDA RAPIDA', 'COMIDA_RAPIDA'),
    ('HAMBURGUESAS', 'COMIDA_RAPIDA'), ('PIZZA', 'COMIDA_RAPIDA'), ('POLLO', 'COMIDA_RAPIDA'),
    ('SANDWICHES', 'COMIDA_RAPIDA'), ('SHAWARMA', 'COMIDA_RAPIDA'),
]
YANGO_SHOP = [('FLORES', 'FLORERIA'), ('ALCOHOL', 'BEBIDAS'), ('BEBIDAS', 'BEBIDAS'), ('VIVERES', 'MINIMARKET'),
              ('FARMACIA', 'FARMACIA')]


def yango(deliveries: Path) -> None:
    delivery = deliveries / 'delivery'
    manifest = verify(delivery, [YANGO_FILE])
    b = Builder('bolivia-yango-poi')
    for row in rows(delivery / YANGO_FILE):
        if not in_bolivia(row['lat'], row['lon']):
            b.dropped['sin_coordenada'] += 1
            continue
        business, _, cuisines = (row['category_raw'] or '').partition(';')
        plain = folded(cuisines)
        table = YANGO_SHOP if business.strip() == 'shop' else YANGO_CUISINE
        found = sorted((plain.find(word), fam) for word, fam in table if word in plain)
        family = found[0][1] if found else ('MINIMARKET' if business.strip() == 'shop' else 'RESTAURANTE')
        if business.strip() == 'shop' and not found:
            b.dropped['tienda_sin_rubro'] += 1
            continue
        place_id = f"yango:{row['source_id']}"
        ok, resembles = b.novel(place_id, row['name'], row['lon'], row['lat'])
        if not ok:
            continue
        raw = row.get('raw') or {}
        b.place(
            family=family, placeId=place_id, publisherRecordId=str(row['source_id']), publisher='Yango Deli',
            name=text(row['name'], 300), locality=text(row.get('municipality'), 160),
            department=text(row.get('department'), 80), latitude=row['lat'], longitude=row['lon'],
            # La dirección de Yango es la calle del local, sin número; el resto del pie de página es del
            # vendedor legal (una persona en muchos casos) y no viaja.
            address=text((row.get('address') or '').split(',', 1)[-1], 300), genericFamily=False,
            classificationMethod='categoria_de_la_plataforma_a_familia_existente_por_tabla_escrita',
            categoryKey=text(row['category_raw'], 120),
            positionMethod='coordenada_publicada_por_un_directorio_privado_no_entrada_verificada',
            dataLevel='DIRECTORIO_PRIVADO_DIRECCION_DECLARADA',
            warnings=['catalogo_de_delivery_no_confirma_local_a_la_calle'],
            sourceDatasetUrl=YANGO_URI, sourceRecordUrl=f"https://food.yango.com/restaurant/{raw.get('slug')}"
            if raw.get('slug') else None, snapshotTakenAt=row['retrieved_at'],
            sourceTags=tags({'categoria': row['category_raw'], 'cadena': row.get('chain'),
                             'calificacion': row.get('rating'), 'resenas': row.get('reviews')}),
            openingHours=text(row.get('hours'), 400), resemblesHeldPlace=resembles,
            licence='Catalogo publico de Yango Deli, sin licencia abierta declarada',
        )
    b.write('yango-poi', {
        'publishers': ['Yango Deli'], 'release': '2026-10-27', 'extractionDate': '2026-10-27',
        'deliverySha256': sha256(delivery / YANGO_FILE), 'deliveryReportSha256': manifest,
        'deliveryUri': YANGO_URI, 'upstreamDatasets': [YANGO_URI]})


# ----------------------------------------------------------------------------- 5. Facebook

FACEBOOK_FILES = [('facebook-lapaz', 'facebook-lapaz.ndjson.gz'),
                  ('facebook-santacruz', 'facebook-santacruz.ndjson.gz'),
                  ('facebook-resto', 'facebook-resto.ndjson.gz')]
# La categoría que el dueño eligió para su página (primer segmento), a una familia del catálogo.
# Lo que no está aquí —«Negocio local», «Producto/servicio», «Emprendedor(a)», «Comunidad»,
# creadores, blogs, figuras públicas— no dice qué hay en el local, o es una persona: no entra.
FACEBOOK_FAMILY = {
    'RESTAURANTE': 'RESTAURANTE', 'RESTAURANTE FAMILIAR': 'RESTAURANTE', 'RESTAURANTE DE CARNES': 'RESTAURANTE',
    'RESTAURANTE DE CARNES ASADAS': 'RESTAURANTE', 'RESTAURANTE DE MARISCOS': 'RESTAURANTE',
    'RESTAURANTE BOLIVIANO': 'RESTAURANTE', 'RESTAURANTE PERUANO': 'RESTAURANTE', 'RESTAURANTE ITALIANO': 'RESTAURANTE',
    'RESTAURANTE DE COMIDA SALUDABLE': 'RESTAURANTE', 'RESTAURANTE DE SUSHI': 'RESTAURANTE',
    'RESTAURANTE MEXICANO': 'RESTAURANTE', 'RESTAURANTE CHINO': 'RESTAURANTE', 'RESTAURANTE JAPONES': 'RESTAURANTE',
    'RESTAURANTE TEX MEX': 'RESTAURANTE', 'RESTAURANTE LATINOAMERICANO': 'RESTAURANTE',
    'RESTAURANTE BRASILENO': 'RESTAURANTE', 'RESTAURANTE INDIO': 'RESTAURANTE', 'RESTAURANTE SUIZO': 'RESTAURANTE',
    'RESTAURANTE VEGETARIANO VEGANO': 'RESTAURANTE', 'RESTAURANTE DE DESAYUNO Y BRUNCH': 'CAFE',
    'RESTAURANTE DE COMIDA RAPIDA': 'COMIDA_RAPIDA', 'RESTAURANTE DE HAMBURGUESAS': 'COMIDA_RAPIDA',
    'PIZZERIA': 'COMIDA_RAPIDA', 'PUESTO DE COMIDA': 'COMIDA_RAPIDA', 'FOOD TRUCK': 'COMIDA_RAPIDA',
    'BAR GRILL': 'BAR_PUB', 'PUB': 'BAR_PUB', 'GASTROPUB': 'BAR_PUB', 'BAR': 'BAR_PUB', 'KARAOKE': 'BAR_PUB',
    'DISCOTECA Y CLUB NOCTURNO': 'DISCOTECA_NIGHTCLUB', 'HELADERIA': 'HELADERIA', 'CAFETERIA': 'CAFE',
    'TIENDA DE CAFE': 'CAFE', 'SALON DE TE': 'CAFE', 'PANADERIA': 'PANADERIA_PASTELERIA',
    'PASTELERIA': 'PANADERIA_PASTELERIA', 'TIENDA DE POSTRES': 'PANADERIA_PASTELERIA',
    'PANADERIA AL POR MAYOR': 'PANADERIA_PASTELERIA', 'CHOCOLATERIA': 'PANADERIA_PASTELERIA',
    'CARNICERIA': 'CARNICERIA', 'FARMACIA': 'FARMACIA', 'PRODUCTOS FARMACEUTICOS': 'FARMACIA',
    'VETERINARIO': 'VETERINARIA', 'TIENDA DE MASCOTAS': 'TIENDA_MASCOTAS', 'ARTICULOS PARA MASCOTAS': 'TIENDA_MASCOTAS',
    'PELUQUERIA': 'PELUQUERIA', 'BARBERIA': 'BARBERIA', 'SALON DE BELLEZA': 'SALON_BELLEZA',
    'SALON DE UNAS': 'UNAS_ESTETICA', 'SPA': 'SPA_MASAJE', 'SERVICIO DE MASAJES': 'SPA_MASAJE',
    'TIENDA DE COSMETICOS': 'COSMETICOS_PERFUMERIA', 'GIMNASIO CENTRO DE FITNESS': 'GIMNASIO',
    'CENTRO DE GIMNASIA': 'GIMNASIO', 'LABORATORIO MEDICO': 'LABORATORIO_CLINICO', 'HOSPITAL': 'HOSPITAL',
    'CENTRO MEDICO': 'CONSULTORIO_MEDICO', 'ODONTOLOGO': 'CONSULTORIO_ODONTOLOGICO',
    'DENTISTA Y CONSULTORIO DENTAL': 'CONSULTORIO_ODONTOLOGICO', 'FISIOTERAPEUTA': 'FISIOTERAPIA_REHABILITACION',
    'PSICOLOGO': 'PSICOLOGIA_SALUD_MENTAL', 'OPTICA': 'OPTICA', 'OPTICO': 'OPTICA', 'FERRETERIA': 'FERRETERIA',
    'MATERIALES DE CONSTRUCCION': 'MATERIALES_CONSTRUCCION',
    'TIENDA DE MATERIALES PARA LA CONSTRUCCION': 'MATERIALES_CONSTRUCCION', 'EMPRESA DE CONSTRUCCION': 'CONSTRUCTORA',
    'TIENDA DE ROPA': 'ROPA_MODA', 'TIENDA DE ROPA PARA MUJERES': 'ROPA_MODA', 'TIENDA DE ROPA PARA HOMBRES': 'ROPA_MODA',
    'TIENDA DE ROPA INFANTIL Y PARA BEBES': 'ROPA_MODA', 'BOUTIQUE': 'ROPA_MODA', 'ZAPATERIA': 'CALZADOS',
    'SUPERMERCADO': 'SUPERMERCADO', 'TIENDA DE COMESTIBLES': 'MINIMARKET', 'TIENDA DE ALIMENTOS NATURALES': 'MINIMARKET',
    'TIENDA DE COMESTIBLES Y ESPECIALIDADES': 'MINIMARKET', 'LIBRERIA': 'LIBRERIA', 'HOTEL': 'HOTEL',
    'COMPLEJO HOTELERO': 'HOTEL', 'ALOJAMIENTO HOTEL': 'HOTEL', 'HOSTAL': 'HOSTAL_HOSTEL',
    'AGENCIA DE VIAJES': 'AGENCIA_VIAJES', 'AGENCIA DE TURISMO': 'OPERADOR_TURISMO',
    'TALLER DE REPARACION DE AUTOMOVILES': 'TALLER_MECANICO', 'SERVICIO AUTOMOTOR': 'TALLER_MECANICO',
    'LAVADO DE AUTOMOVILES': 'LAVADERO_AUTOS', 'TIENDA DE AUTOPARTES': 'REPUESTOS_AUTOS',
    'TIENDA DE REPUESTOS DE AUTOMOVILES': 'REPUESTOS_AUTOS', 'VENDEDOR DE NEUMATICOS Y TALLER DE REPARACION': 'LLANTERIA',
    'ELECTRODOMESTICOS': 'ELECTRODOMESTICOS', 'TIENDA DE COMPUTACION': 'COMPUTACION',
    'TIENDA DE TELEFONIA CELULAR': 'CELULARES_TELEFONIA', 'MUEBLERIA': 'MUEBLES_HOGAR', 'MUEBLES': 'MUEBLES_HOGAR',
    'TIENDA DE COLCHONES': 'MUEBLES_HOGAR', 'INMOBILIARIA': 'INMOBILIARIA', 'SERVICIO DE BIENES RAICES': 'INMOBILIARIA',
    'UNIVERSIDAD': 'UNIVERSIDAD', 'COLEGIO UNIVERSITARIO': 'UNIVERSIDAD', 'ESCUELA DE IDIOMAS': 'ACADEMIA_IDIOMAS',
    'GUARDERIA': 'GUARDERIA', 'BICICLETERIA': 'BICICLETAS_TIENDA', 'TIENDA DE BICICLETAS DE MONTANA': 'BICICLETAS_TIENDA',
    'SERVICIO DE IMPRESION': 'IMPRENTA_FOTOCOPIAS', 'AGENCIA DE PUBLICIDAD': 'PUBLICIDAD_MARKETING',
    'SERVICIO DE CATERING': 'CATERING', 'SALA DE EVENTOS Y ESPECTACULOS': 'CENTRO_EVENTOS', 'CENTRO COMERCIAL': 'CENTRO_COMERCIAL',
    'EMISORA DE RADIO': 'MEDIOS_COMUNICACION', 'CANAL DE TELEVISION': 'MEDIOS_COMUNICACION',
    'CENTRO CULTURAL': 'CENTRO_CULTURAL', 'CERRAJERO': 'CERRAJERIA', 'FLORISTA': 'FLORERIA', 'JUGUETERIA': 'JUGUETERIA',
    'JOYERIA Y RELOJERIA': 'JOYERIA_RELOJERIA', 'VENDEDOR DE JOYAS': 'JOYERIA_RELOJERIA', 'CINE': 'CINE',
    'BIBLIOTECA': 'BIBLIOTECA', 'MUSEO DE ARTE': 'MUSEO', 'ESTUDIO DE TATUAJES Y PIERCINGS': 'TATUAJE_PIERCING',
    'ESCUELA DE MANEJO': 'AUTOESCUELA', 'CONCESIONARIA': 'CONCESIONARIO_AUTOS', 'CORREDOR DE SEGUROS': 'CORREDOR_SEGUROS',
    'VINOS LICORES': 'BEBIDAS', 'PESCADERIA': 'CARNICERIA', 'TIENDA DEPARTAMENTAL': 'TIENDA_DEPARTAMENTOS',
    'GARAJE ESTACIONAMIENTO': 'ESTACIONAMIENTO', 'FABRICA DE CERVEZA': 'CERVECERIA_PLANTA',
}
FACEBOOK_STALE_BEFORE = '2024'


def facebook(deliveries: Path) -> None:
    b = Builder('bolivia-facebook-poi')
    manifests = []
    for folder, name in FACEBOOK_FILES:
        delivery = deliveries / folder
        manifests.append(verify(delivery, [name]))
        for row in rows(delivery / name):
            if row.get('status') not in (None, 'OK'):
                b.dropped['pagina_no_disponible'] += 1
                continue
            if not in_bolivia(row['lat'], row['lon']):
                b.dropped['sin_coordenada'] += 1
                continue
            category = (row.get('category_raw') or '').split('·')[0].strip()
            family = FACEBOOK_FAMILY.get(folded(category))
            if family is None:
                b.dropped['categoria_que_no_dice_el_rubro_o_es_persona'] += 1
                continue
            if generic_name(row['name']):
                b.dropped['nombre_es_solo_la_actividad'] += 1
                continue
            place_id = f"facebook:{row['source_id']}"
            ok, resembles = b.novel(place_id, row['name'], row['lon'], row['lat'])
            if not ok:
                continue
            last = row.get('last_post_at') or row.get('source_updated_at') or ''
            stale = not last or last[:4] < FACEBOOK_STALE_BEFORE
            b.place(
                family=family, placeId=place_id, publisherRecordId=str(row['source_id']),
                publisher='Facebook (paginas publicas)', name=text(row['name'], 300),
                locality=text(row.get('municipality'), 160), department=text(row.get('department'), 80),
                address=text(row.get('address'), 300), latitude=row['lat'], longitude=row['lon'], genericFamily=False,
                classificationMethod='categoria_de_la_plataforma_a_familia_existente_por_tabla_escrita',
                categoryKey=text(row['category_raw'], 120),
                positionMethod='coordenada_publicada_por_un_directorio_privado_no_entrada_verificada',
                dataLevel='DIRECTORIO_COLABORATIVO_SIN_ACTUALIZAR' if stale else 'DIRECTORIO_COLABORATIVO',
                websites=[row['website']] if row.get('website') and 4 <= len(row['website']) <= 2000 else [],
                socials=[row['source_url']] if row.get('source_url') and len(row['source_url']) <= 500 else [],
                warnings=['pagina_declarada_por_su_administrador_no_confirma_local_abierto']
                + ([f'sin_publicar_desde_antes_de_{FACEBOOK_STALE_BEFORE}'] if stale else []),
                sourceDatasetUrl='https://www.facebook.com/', sourceRecordUrl=text(row.get('source_url'), 400),
                snapshotTakenAt=row['retrieved_at'].replace('.000Z', 'Z') if row.get('retrieved_at') else None,
                sourceTags=tags({'categoriaFacebook': row.get('category_raw'), 'seguidores': row.get('followers'),
                                 'ultimaPublicacion': row.get('last_post_at')}),
                resemblesHeldPlace=resembles,
                licence='Pagina publica de Facebook, sin licencia abierta declarada',
            )
    b.write('facebook-poi', {
        'publishers': ['Facebook (paginas publicas)'], 'release': '2026-10-28', 'extractionDate': '2026-10-28',
        'deliverySha256': hashlib.sha256(''.join(manifests).encode()).hexdigest(),
        'deliveryReportSha256': manifests[0],
        'deliveryUri': 'https://github.com/PabloArauzCaballero/EcomicDataCenter/tree/datos/2026-10-27-facebook-lapaz',
        'upstreamDatasets': ['https://www.facebook.com/']})


# ----------------------------------------------------------------------------- 6. Geoportales

# Solo capas de establecimientos con nombre comercial. Fuera, a propósito: `sit:restaurantes`
# (la «razón social» del padrón municipal es muchas veces el nombre de una persona), tiendas de
# barrio y consultorios dentales de la Guía Urbana (ídem), casas de acogida y centros de
# drogodependientes (lugares que no se publican en un mapa), números de puerta, puestos de venta
# sin nombre, toponimia y Wikidata (rasgos naturales).
GAMLP_LAYERS = {
    'lpm__restaurantes': ('lpm:restaurantes', 'RESTAURANTE'),
    'lpm__hospedajes': ('lpm:hospedajes', 'HOSPEDAJE'),
    'sit__hoteleshostales': ('sit:hoteleshostales', 'HOSPEDAJE'),
    'lpm__empresasturismo': ('lpm:empresasturismo', 'AGENCIA_VIAJES'),
    'sit__farmacias_smde': ('sit:farmacias_smde', 'FARMACIA'),
    'sit__supermercados': ('sit:supermercados', 'SUPERMERCADO'),
}
GAMSCS_LAYERS = {
    'FARMACIA': 'FARMACIA', 'CLINICAS PRIVADA': 'CLINICA_PRIVADA', 'LABORATORIOS CLINICOS': 'LABORATORIO_CLINICO',
    'CLINICAS VETERINARIA': 'VETERINARIA', 'COLEGIO PRIVADO': 'COLEGIO_ESCUELA',
    'CENTRO ABASTECIMIENTO MERCADO MINORISTA': 'MERCADO', 'CENTRO ABASTECIMIENTO MERCADO MAYORISTA': 'MERCADO',
    'INSTITUCIONES GUBERNAMENTALES': 'OFICINA_GOBIERNO', 'SUPERMERCADOS': 'SUPERMERCADO', 'PARQUEOS': 'ESTACIONAMIENTO',
    'PUESTOS POLICIALES': 'POLICIA', 'ESTACION POLICIAL INTEGRAL DISTRITAL': 'POLICIA', 'INSTITUTOS': 'INSTITUTO_TECNICO',
    'CENTRO MEDICO': 'CLINICA', 'UNIVERSIDADES': 'UNIVERSIDAD', 'BALNEARIOS PISCINAS': 'PISCINA',
    'CENTROS CULTURALES': 'CENTRO_CULTURAL', 'MEDIOS DE COMUNICACION': 'MEDIOS_COMUNICACION',
    'COLISEOS DISTRITALES': 'CENTRO_DEPORTIVO', 'POLI CONSULTORIO': 'POLICONSULTORIO', 'BIBLIOTECAS': 'BIBLIOTECA',
    'INSTITUCIONES NO GUBERNAMENTALES': 'ONG_FUNDACION', 'CENTROS COMERCIALES': 'CENTRO_COMERCIAL', 'MALL': 'CENTRO_COMERCIAL',
    'CLUB PRIVADOS': 'CLUB_DEPORTIVO', 'LIBRERIA PAPELERIA': 'LIBRERIA', 'SUB ALCALDIA': 'ALCALDIA_SUBALCALDIA',
    'CENTRO DE ADULTO MAYOR': 'CENTRO_ADULTO_MAYOR', 'TEATRO': 'TEATRO', 'MICRO MERCADO': 'MINIMARKET',
    'HOSPITAL 3ER NIVEL': 'HOSPITAL', 'HOSPITAL 4TO NIVEL': 'HOSPITAL', 'CINE': 'CINE', 'MUSEO': 'MUSEO',
    'ESTADIOS': 'ESTADIO', 'MINI ESTADIOS': 'ESTADIO', 'ZOOLOGICO': 'ZOO_ACUARIO', 'PARQUES URBANOS': 'PARQUE',
    'PLAZAS': 'PLAZA', 'CANCHAS POLIFUNCIONALES': 'CANCHA', 'CANCHAS DE FUTBOL': 'CANCHA',
    'CANCHAS DE PASTO SINTETICO FUTBOL': 'CANCHA',
}
GAMSCS_FILE = 'gamscs-guia-urbana-santa-cruz/gamscs-guia-urbana.ndjson.gz'


def geoportal(deliveries: Path) -> None:
    delivery = deliveries / 'geoportales'
    files = [f'gamlp-sit-la-paz/{name}.ndjson.gz' for name in GAMLP_LAYERS] + [GAMSCS_FILE]
    manifest = verify(delivery, files)
    b = Builder('bolivia-geoportal-poi')

    def add(row, publisher, prefix, layer, family, licence, extra):
        if not in_bolivia(row['lat'], row['lon']):
            b.dropped['sin_coordenada'] += 1
            return
        if generic_name(row['name']):
            b.dropped['nombre_es_solo_la_actividad'] += 1
            return
        digest = hashlib.sha1(f"{layer}:{row['source_id']}".encode()).hexdigest()[:24]
        place_id = f'{prefix}:{digest}'
        ok, resembles = b.novel(place_id, row['name'], row['lon'], row['lat'])
        if not ok:
            return
        b.place(
            family=family, placeId=place_id, publisherRecordId=str(row['source_id'])[:200], publisher=publisher,
            name=text(row['name'], 300), locality=text(row.get('municipality'), 160),
            department=text(row.get('department'), 80), address=text(row.get('address'), 300),
            latitude=row['lat'], longitude=row['lon'], genericFamily=False,
            classificationMethod='capa_del_geoportal_municipal_a_familia_existente',
            categoryKey=text(row['category_raw'], 120),
            positionMethod='coordenada_publicada_por_la_entidad_no_entrada_verificada',
            dataLevel='CONTACTO_Y_DIRECCION_PUBLICADOS',
            warnings=['capa_municipal_sin_fecha_de_vigencia_del_local'],
            sourceDatasetUrl=text(row.get('source_url'), 400), snapshotTakenAt=row['retrieved_at'],
            sourceTags=tags({'capa': layer, 'categoria': row['category_raw'],
                             'actualizado': row.get('source_updated_at'), **extra}),
            resemblesHeldPlace=resembles, licence=licence,
        )

    for name, (layer, family) in GAMLP_LAYERS.items():
        for row in rows(delivery / f'gamlp-sit-la-paz/{name}.ndjson.gz'):
            plain = folded(row['name'])
            chosen = family
            if family == 'HOSPEDAJE':
                chosen = 'HOTEL' if 'HOTEL' in plain else 'HOSTAL_HOSTEL'
            elif family == 'SUPERMERCADO' and 'MICROMARKET' in folded(row['category_raw']):
                chosen = 'MINIMARKET'
            add(row, 'GAMLP (SIT La Paz)', f"gamlp:{layer.replace(':', '_').lower()}", layer, chosen,
                'Servicio publico del GAMLP (SIT), sin licencia declarada; citar GAMLP - SIT', {})
    for row in rows(delivery / GAMSCS_FILE):
        raw = row.get('raw') or {}
        family = GAMSCS_LAYERS.get(folded(raw.get('capa')))
        if family is None:
            b.dropped['capa_fuera_de_la_carga'] += 1
            continue
        add(row, 'GAMSCS (Guia Urbana)', f"gamscs:{folded(raw.get('capa')).lower().replace(' ', '_')[:40]}",
            raw.get('capa'), family, 'Guia Urbana del GAMSCS, sin licencia declarada',
            {'grupo': raw.get('grupo'), 'distrito': raw.get('distrito_municipal')})
    b.write('geoportal-poi', {
        'publishers': sorted({p['publisher'] for p in b.places}), 'release': '2026-10-27',
        'extractionDate': '2026-10-27', 'deliverySha256': manifest,
        'deliveryReportSha256': sha256(delivery / GAMSCS_FILE),
        'deliveryUri': 'https://github.com/PabloArauzCaballero/EcomicDataCenter/tree/datos/2026-10-27-geoportales',
        'upstreamDatasets': ['https://sitservicios.lapaz.bo/geoserver/ows',
                             'https://guiaurbana.gmsantacruz.gob.bo/guiaurbana/public/api/']})


STEPS = {'overture': overture, 'osm': osm, 'official': official, 'yango': yango, 'facebook': facebook,
         'geoportal': geoportal}


def main() -> None:
    parser = argparse.ArgumentParser()
    parser.add_argument('--deliveries', required=True, type=Path)
    parser.add_argument('steps', nargs='+', choices=[*STEPS, 'all'])
    args = parser.parse_args()
    for step in (list(STEPS) if 'all' in args.steps else args.steps):
        STEPS[step](args.deliveries)


if __name__ == '__main__':
    main()
