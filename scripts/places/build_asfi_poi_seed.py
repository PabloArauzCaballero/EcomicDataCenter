#!/usr/bin/env python3
"""Construye `bolivia-asfi-poi`: los puntos de atención financiera que registra la ASFI.

    python scripts/places/build_asfi_poi_seed.py \
      --candidates <extracto>/candidatos.ndjson \
      --correspondents <extracto>/candidatos-corresponsales.ndjson \
      --api <extracto>/crudo/asfi-puntosAtencion-fecha-2009-07-01.json \
      --retrieved 2026-09-24T14:56:49Z

La ASFI publica cada punto de atención de las entidades que supervisa —agencias,
sucursales, ventanillas, cajeros y corresponsales— con su coordenada, en la API
que consume su propia aplicación «ASFI Digital»
(`asfidigitalapi.asfi.gob.bo/api/v1/puntosAtencion/fecha/{desde}`, sin
autenticación) y, sin coordenadas, en el portal de consulta de su sitio. El
extracto une las dos por el identificador de la ASFI (sigla + número) y quita lo
que el corpus ya tenía (cajeros de Tel.bo, bancos de OpenStreetMap y Overture)
por marca a menos de 100 m. Medido el 2026-09-24: 14.136 puntos válidos, 5.294
oficinas y cajeros nuevos y 7.416 corresponsales.

Es la fuente que manda en cajeros y oficinas: la ASFI es quien los autoriza. Por
eso el barrido de OpenStreetMap no carga `amenity=atm`.

Se descartan aquí, y se cuentan:
- coordenadas compartidas con 4 o más direcciones distintas: un punto de relleno,
  no la ubicación de ninguna de ellas (hasta 59 puntos en un mismo par);
- puntos a más de 40 km del municipio que la propia fila declara.

La localidad llega en mayúsculas y sin tilde (`POTOSI`); se escribe como la
escribe el catálogo de municipios cuando es uno de ellos, y si no, se deja vacía
para que la asigne el polígono. Dejarla cruda abría una segunda «ciudad» al lado
de la que el tablero ya muestra.
"""

from __future__ import annotations

import argparse
import collections
import hashlib
import json
import re
import unicodedata
from pathlib import Path

ROOT = Path(__file__).resolve().parents[2]
OUT = ROOT / 'src' / 'database' / 'seeds' / 'boot' / 'bolivia-asfi-poi'
CATALOGUE = Path(__file__).resolve().parent / 'catalogue' / 'bolivia-place-families.json'
MUNICIPALITIES = Path(__file__).resolve().parent / 'catalogue' / 'bolivia-municipalities.json'
API_URI = 'https://asfidigitalapi.asfi.gob.bo/api/v1/puntosAtencion/fecha/2009-07-01'
PIECE = 1200
STACKED_ADDRESSES = 4
FAR_KM = 40

# El tipo de entidad que la ASFI asigna, a la familia de su oficina.
OFFICE_FAMILY_BY_ENTITY_TYPE = {
    1: 'BANCO_MULTIPLE',
    3: 'COOPERATIVA_FINANCIERA',
    10: 'BANCO_DESARROLLO_PRODUCTIVO',
    27: 'INSTITUCION_FINANCIERA_DESARROLLO',
    74: 'BANCO_PYME',
    75: 'ENTIDAD_FINANCIERA_VIVIENDA',
    9: 'CASA_CAMBIO',
    55: 'REMESAS_PAGOS',
}
FAMILY_BY_KIND = {'ATM': 'CAJERO_ATM', 'CORRESP': 'CORRESPONSAL_FINANCIERO'}


def sha256(path: Path) -> str:
    return hashlib.sha256(path.read_bytes()).hexdigest()


def text_tags(tags: dict) -> dict[str, str]:
    """El esquema guarda las etiquetas como texto: lo que no lo es viaja en JSON."""
    return {key: value if isinstance(value, str) else json.dumps(value, ensure_ascii=False)
            for key, value in tags.items() if value is not None}


def folded(text: str) -> str:
    plain = unicodedata.normalize('NFD', text or '')
    return re.sub(r'\s+', ' ', ''.join(c for c in plain if unicodedata.category(c) != 'Mn')).strip().upper()


def main() -> None:
    parser = argparse.ArgumentParser()
    parser.add_argument('--candidates', required=True, type=Path)
    parser.add_argument('--correspondents', required=True, type=Path)
    parser.add_argument('--api', required=True, type=Path)
    parser.add_argument('--retrieved', required=True)
    args = parser.parse_args()

    catalogue = {row['code']: row for row in json.loads(CATALOGUE.read_text('utf-8'))['familias']}
    names = collections.defaultdict(set)
    for row in json.loads(MUNICIPALITIES.read_text('utf-8'))['municipalities']:
        names[folded(row['name'])].add(row['name'])
        names[folded(row['officialName'])].add(row['name'])

    rows = [json.loads(line) for path in (args.candidates, args.correspondents)
            for line in path.read_text('utf-8').splitlines()]
    places, dropped = [], collections.Counter()
    for row in rows:
        warnings = row.get('warnings') or []
        stacked = [int(w.rsplit('-', 3)[1]) for w in warnings if w.startswith('coordenada-compartida-con-')]
        if stacked and max(stacked) >= STACKED_ADDRESSES:
            dropped['coordenada_de_relleno'] += 1
            continue
        far = [int(w.split(':')[1].rstrip('km')) for w in warnings if w.startswith('lejos-de-su-municipio-declarado:')]
        if far and max(far) > FAR_KM:
            dropped['lejos_de_su_municipio'] += 1
            continue
        kind = row['pointKind']
        family = FAMILY_BY_KIND.get(kind) or OFFICE_FAMILY_BY_ENTITY_TYPE.get(row['entityTypeCode'], 'OV_FINANCIAL_SERVICE')
        entry = catalogue[family]
        declared = names.get(folded(row.get('municipality') or row.get('locality') or ''), set())
        # Seis nombres se repiten en dos departamentos: ahí decide el polígono.
        locality = next(iter(declared)) if len(declared) == 1 else None
        resembles = row.get('resemblesHeldPlace') or []
        nearest = min(resembles, key=lambda r: r['distanceM']) if resembles else None
        places.append({
            'placeId': row['placeId'],
            'publisherRecordId': row['publisherRecordId'],
            'publisher': 'ASFI',
            'name': (row.get('displayNameProposed') or row['name'])[:300],
            'locality': locality,
            'department': row.get('department'),
            'address': (row.get('address') or '')[:300] or None,
            'latitude': row['latitude'],
            'longitude': row['longitude'],
            'entityGroup': entry['group'],
            'entityFamily': family,
            'commercialRole': entry['commercial_role'],
            'isRegulated': bool(entry['is_regulated']),
            'officialValidationSource': entry['official_validation_source'],
            'validationPriority': 'HIGH',
            'genericFamily': family == 'OV_FINANCIAL_SERVICE',
            'classificationMethod': 'actividad_declarada_por_el_regulador_en_su_registro',
            'categoryKey': row['categoryKey'],
            'taxonomyHierarchy': [],
            'basicCategory': None,
            'confidence': None,
            'positionMethod': 'coordenada_publicada_por_el_regulador_no_entrada_verificada',
            'dataLevel': 'REGISTRO_DEL_REGULADOR_DIRECCION_DECLARADA',
            'phones': [],
            'emails': [],
            'websites': [],
            'socials': [],
            'warnings': [w for w in warnings if not w.startswith('sin-fila-en-portal')][:20]
                        + (['nombre_armado_con_entidad_y_tipo'] if any(w.startswith('sin-fila-en-portal') for w in warnings) else []),
            'sourceDatasetUrl': API_URI,
            'sourceRecordUrl': None,
            'snapshotTakenAt': args.retrieved,
            'sourceTags': text_tags({**(row.get('sourceTags') or {}), 'entity': row.get('entity'),
                           'entitySigla': row.get('entitySigla'), 'asfiIdentificador': row.get('asfiIdentificador'),
                           'municipioDeclarado': row.get('municipality'), 'fechaModificacionFuente': row.get('fechaModificacionFuente')}),
            'openingHours': ((row.get('sourceTags') or {}).get('horarios') or '')[:400] or None,
            'resemblesHeldPlace': {'placeId': nearest['placeId'], 'name': nearest['name'][:300], 'metres': nearest['distanceM']}
            if nearest else None,
            'licence': 'Informacion publica de la ASFI, sin licencia abierta declarada. Fuente: ASFI',
            'observationId': row['placeId'],
        })

    places.sort(key=lambda place: int(place['publisherRecordId']))
    provenance = {
        'publishers': ['ASFI'],
        'release': args.retrieved[:10],
        'extractionDate': args.retrieved[:10],
        'deliverySha256': sha256(args.api),
        'deliveryReportSha256': sha256(args.candidates),
        'deliveryUri': API_URI,
        'upstreamDatasets': [API_URI, 'https://appweb2.asfi.gob.bo/PaginasPublicas2/VistaPAF/UbicacionPAF.aspx'],
        'licences': ['Informacion publica de la ASFI, sin licencia abierta declarada'],
        'geofenceMethod': 'declared_municipality',
        'countryCode': 'BO',
        'catalogueFamilies': len(catalogue),
    }
    OUT.mkdir(parents=True, exist_ok=True)
    for old in OUT.glob('*.json'):
        old.unlink()
    for index in range(0, len(places), PIECE):
        target = OUT / f'asfi-poi-{index // PIECE:03d}.json'
        target.write_text(json.dumps({'dataset': 'bolivia-national-poi-v3', 'provenance': provenance,
                                      'places': places[index:index + PIECE]}, ensure_ascii=False, indent=1) + '\n',
                          'utf-8', newline='\n')
    print(json.dumps({'lugares': len(places), 'descartados': dict(dropped),
                      'familias': dict(collections.Counter(p['entityFamily'] for p in places)),
                      'sin_localidad': sum(1 for p in places if p['locality'] is None)}, ensure_ascii=False))


if __name__ == '__main__':
    main()
