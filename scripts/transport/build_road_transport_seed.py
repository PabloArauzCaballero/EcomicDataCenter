#!/usr/bin/env python3
"""Build the traceable road-transport snapshot used by the observatory.

The INE workbooks are the source of registered-vehicle and GNV readings.  The
2013 fare table is an archived transcription of ATT resolution 0178/2013 and
the 2025 rows are the table exposed by ATT's current tariff page and annex to
resolution 32/2025.  Every input digest travels into the seed; this script
never downloads a source implicitly, so an operator knows exactly which files
were reviewed before generating a new snapshot.
"""

from __future__ import annotations

import argparse
import hashlib
from html.parser import HTMLParser
import json
from pathlib import Path
import re
import unicodedata

import openpyxl

RETRIEVED_AT = '2026-10-03T00:00:00Z'
INE_PAGE = 'https://www.ine.gob.bo/index.php/estadisticas-economicas/transportes/parque-automotor-cuadros-estadisticos/'

FILES = {
    'FLEET_DEPARTMENT_SERVICE': (
        'fleet-department-service.xlsx', 'Instituto Nacional de Estadística / RUAT',
        'Bolivia parque automotor según departamento y tipo de servicio, 2003–2025',
        'https://nube.ine.gob.bo/index.php/s/w8kgTAQaj0mkXrz/download', 'LOADED', None,
    ),
    'FLEET_SERVICE_CLASS': (
        'fleet-service-class.xlsx', 'Instituto Nacional de Estadística / RUAT',
        'Bolivia parque automotor por tipo de servicio y clase, 2003–2025',
        'https://nube.ine.gob.bo/index.php/s/3719r540c6SBqi1/download', 'LOADED', None,
    ),
    'FLEET_CAPACITY': (
        'fleet-capacity.xlsx', 'Instituto Nacional de Estadística / RUAT',
        'Bolivia parque automotor por servicio, clase y capacidad, 2003–2025',
        'https://nube.ine.gob.bo/index.php/s/F1KAkKLlf8XzrGn/download', 'LOADED', None,
    ),
    'FLEET_MODEL': (
        'fleet-model.xlsx', 'Instituto Nacional de Estadística / RUAT',
        'Bolivia parque automotor por servicio, clase y modelo, 2003–2025',
        'https://nube.ine.gob.bo/index.php/s/jlXVWWo0rtDU3kB/download',
        'EMPTY_OFFICIAL_WORKBOOK', 'El libro descargado no contiene celdas de datos.',
    ),
    'FLEET_CYLINDER': (
        'fleet-cylinder.xlsx', 'Instituto Nacional de Estadística / RUAT',
        'Bolivia parque automotor por servicio, clase y cilindrada, 2003–2025',
        'https://nube.ine.gob.bo/index.php/s/klGBNQVYvPYbMOK/download',
        'EMPTY_OFFICIAL_WORKBOOK', 'El libro descargado no contiene celdas de datos.',
    ),
    'GNV_QUARTER': (
        'gnv-quarter.xlsx', 'Instituto Nacional de Estadística / EEC-GNV',
        'Conversiones a GNV por año, trimestre y departamento, 2010–2025',
        'https://nube.ine.gob.bo/index.php/s/wmW5MXJJdTBtme0/download', 'LOADED', None,
    ),
    'GNV_TYPE': (
        'gnv-type.xlsx', 'Instituto Nacional de Estadística / EEC-GNV',
        'Conversiones a GNV por departamento y tipo de vehículo, 2017–2025',
        'https://nube.ine.gob.bo/index.php/s/HwaJ6hXpYmfmgTN/download', 'LOADED', None,
    ),
    'GNV_REQUAL_QUARTER': (
        'gnv-requalification-quarter.xlsx', 'Instituto Nacional de Estadística / EEC-GNV',
        'Recalificaciones de cilindros GNV por año, trimestre y departamento, 2011–2025',
        'https://nube.ine.gob.bo/index.php/s/MCE8FHTGVukGg8g/download', 'LOADED', None,
    ),
    'GNV_REQUAL_TYPE': (
        'gnv-requalification-type.xlsx', 'Instituto Nacional de Estadística / EEC-GNV',
        'Recalificaciones de cilindros GNV por departamento y tipo, 2017–2025',
        'https://nube.ine.gob.bo/index.php/s/7QXSILj5eD6oinM/download', 'LOADED', None,
    ),
    'ATT_2013_ARCHIVE': (
        'att-2013-archive.html', 'Bolivia es Turismo (transcripción de ATT)',
        'Banda tarifaria de la resolución ATT-DJ-RA TR 0178/2013',
        'https://boliviaesturismo.com/tarifario-de-transporte-interdepartamental-y-local-en-bolivia/',
        'LOADED', 'La tarifa máxima se contrasta con el afiche oficial de la ATT.',
    ),
    'ATT_2013_PDF': (
        'att-2013-tariff.pdf', 'Autoridad de Regulación y Fiscalización de Telecomunicaciones y Transportes',
        'Afiche oficial de tarifas máximas de la resolución 0178/2013',
        'https://www.att.gob.bo/sites/default/files/archivos_portada/2021-08/Tarifario%20ATT%20T.%20Transporte.pdf',
        'REFERENCE_ONLY', 'El afiche oficial publica máximos; el archivo histórico aporta mínimos y máximos.',
    ),
    'ATT_2025_PDF': (
        'att-2025-tariff.pdf', 'Autoridad de Regulación y Fiscalización de Telecomunicaciones y Transportes',
        'Resolución ATT-DJ-RAR-TR LP 32/2025 y anexo tarifario',
        'https://www.att.gob.bo/sites/default/files/comunicados/2025-12/ATT-DJ-RAR-TR-LP-32-2025.pdf',
        'LOADED', None,
    ),
    'ATT_2025_ONLINE': (
        'att-2025-online.html', 'Autoridad de Regulación y Fiscalización de Telecomunicaciones y Transportes',
        'Tarifas Online: transporte terrestre interdepartamental',
        'https://tarifas.att.gob.bo/index.php/tarifaspizarra/tarifasRutasDepartamentalesTerrestre',
        'REFERENCE_ONLY', 'La página seguía mostrando la resolución 32/2025 al recuperar el snapshot.',
    ),
}

DEPARTMENTS = {
    'BOLIVIA': 'BOLIVIA', 'TOTAL': 'BOLIVIA', 'CHUQUISACA': 'CHUQUISACA',
    'LA PAZ': 'LA_PAZ', 'COCHABAMBA': 'COCHABAMBA', 'ORURO': 'ORURO',
    'POTOSI': 'POTOSI', 'TARIJA': 'TARIJA', 'SANTA CRUZ': 'SANTA_CRUZ',
    'BENI': 'BENI', 'PANDO': 'PANDO',
}
SERVICES = {'TOTAL': 'TOTAL', 'PARTICULAR': 'PARTICULAR', 'PUBLICO': 'PUBLICO', 'OFICIAL': 'OFICIAL'}
CLASSES = {
    'TOTAL': 'TOTAL', 'AMBULANCIA': 'AMBULANCIA', 'AUTOMOVIL': 'AUTOMOVIL',
    'BUS': 'BUS', 'OMNIBUS': 'BUS', 'CAMION': 'CAMION', 'CAMIONETA': 'CAMIONETA',
    'FURGON': 'FURGON', 'JEEP': 'JEEP', 'MAQUINARIA PESADA': 'MAQUINARIA_PESADA',
    'MICROBUS': 'MICROBUS', 'MINIBUS': 'MINIBUS', 'MOTO': 'MOTO',
    'QUADRATRACK': 'QUADRATRACK', 'QUADRA TRACK': 'QUADRATRACK', 'TORPEDO': 'TORPEDO',
    'TRACTO CAMION': 'TRACTO_CAMION', 'TRIMOVIL CAMION': 'TRIMOVIL_CAMION',
    'VAGONETA': 'VAGONETA',
}
CAPACITIES = {
    'MENOR O IGUAL A 1,4': 'LE_1_4', 'MAYORES A 1,4 HASTA 3': 'GT_1_4_LE_3',
    'MAYORES A 3 HASTA 5': 'GT_3_LE_5', 'MAYORES A 5 HASTA 11': 'GT_5_LE_11',
    'MAYORES A 11 HASTA 13': 'GT_11_LE_13', 'MAYORES A 13': 'GT_13',
    'SIN ESPECIFICAR': 'UNSPECIFIED',
}

# Snapshot read from the ATT table on 2026-10-03. Zeroes in the publisher's
# table mean that the class is not offered; ``fare`` converts them to None.
ATT_2025_ROWS = [
    ['COCHABAMBA', 'SANTA CRUZ (n)', 70, 90, 92, 125, 148, 183],
    ['COCHABAMBA', 'SANTA CRUZ (a)', 87, 106, 106, 143, 162, 207],
    ['COCHABAMBA', 'ORURO', 29, 43, 36, 56, 85, 95],
    ['COCHABAMBA', 'SUCRE', 67, 94, 78, 123, 148, 192],
    ['COCHABAMBA', 'POTOSI', 67, 87, 106, 129, 162, 186],
    ['COCHABAMBA', 'TARIJA', 155, 183, 190, 246, 288, 358],
    ['COCHABAMBA', 'UYUNI', 95, 140, 141, 203, 211, 291],
    ['LA PAZ', 'ORURO', 27, 39, 36, 53, 78, 85],
    ['LA PAZ', 'COCHABAMBA', 55, 73, 78, 102, 120, 148],
    ['LA PAZ', 'SANTA CRUZ (n)', 113, 153, 176, 224, 232, 308],
    ['LA PAZ', 'SANTA CRUZ (a)', 127, 161, 190, 234, 246, 319],
    ['LA PAZ', 'POTOSI', 67, 88, 106, 129, 148, 181],
    ['LA PAZ', 'SUCRE', 91, 126, 120, 175, 183, 252],
    ['LA PAZ', 'TARIJA', 155, 185, 190, 248, 295, 363],
    ['LA PAZ', 'VILLAZON', 155, 185, 190, 248, 274, 351],
    ['LA PAZ', 'UYUNI', 95, 133, 140, 192, 211, 276],
    ['ORURO', 'POTOSI', 38, 53, 57, 74, 85, 105],
    ['ORURO', 'SUCRE', 64, 88, 78, 118, 127, 175],
    ['ORURO', 'UYUNI', 55, 69, 98, 106, 148, 154],
    ['ORURO', 'VILLAZON', 115, 143, 0, 0, 0, 0],
    ['ORURO', 'TARIJA', 118, 144, 0, 0, 0, 0],
    ['POTOSI', 'SUCRE', 18, 29, 29, 43, 43, 60],
    ['POTOSI', 'TARIJA', 78, 102, 92, 134, 127, 186],
    ['SANTA CRUZ', 'TRINIDAD', 69, 87, 106, 127, 169, 188],
    ['SANTA CRUZ', 'YACUIBA', 66, 85, 106, 127, 148, 176],
    ['SANTA CRUZ', 'SUCRE', 106, 134, 120, 176, 148, 238],
    ['SANTA CRUZ', 'TARIJA', 143, 183, 211, 266, 258, 356],
    ['SUCRE', 'UYUNI', 64, 83, 92, 116, 141, 167],
    ['TARIJA', 'VILLAZON', 52, 63, 0, 0, 0, 0],
    ['TARIJA', 'SUCRE', 111, 139, 0, 0, 0, 0],
]


def fold(value: object) -> str:
    text = re.sub(r'⁽[^⁾]*⁾', '', str(value or '')).replace('-', ' ')
    text = unicodedata.normalize('NFD', text)
    text = ''.join(char for char in text if unicodedata.category(char) != 'Mn')
    return ' '.join(re.sub(r'[^A-Za-z0-9,]+', ' ', text).upper().split())


def digest(path: Path) -> str:
    return hashlib.sha256(path.read_bytes()).hexdigest()


def sheet_rows(path: Path) -> list[list[object]]:
    sheet = openpyxl.load_workbook(path, data_only=True, read_only=True).worksheets[0]
    return [list(row) for row in sheet.iter_rows(values_only=True)]


def year_columns(rows: list[list[object]]) -> tuple[int, dict[int, tuple[str, bool]]]:
    for row_index, row in enumerate(rows):
        columns: dict[int, tuple[str, bool]] = {}
        for column, value in enumerate(row):
            match = re.fullmatch(r'(20\d{2})(?:\(p\))?', str(value or '').replace(' ', ''))
            if match:
                columns[column] = (match.group(1), '(p)' in str(value))
        if len(columns) >= 5:
            return row_index, columns
    raise ValueError('No annual columns found')


def add_years(target: list[dict], row: list[object], columns, base: dict) -> None:
    for column, (period, preliminary) in columns.items():
        value = row[column] if column < len(row) else None
        if isinstance(value, (int, float)):
            target.append({**base, 'period': period, 'value': int(value), 'preliminary': preliminary})


def fleet_department_service(path: Path) -> list[dict]:
    rows = sheet_rows(path); start, columns = year_columns(rows); points = []; department = None
    for row in rows[start + 1:]:
        label = fold(row[1] if len(row) > 1 else None)
        if label.startswith('FUENTE'): break
        if label == 'TOTAL':
            base = {'dimension': 'DEPARTMENT_SERVICE', 'department': 'BOLIVIA', 'service': 'TOTAL'}
        elif label in DEPARTMENTS and label != 'BOLIVIA':
            department = DEPARTMENTS[label]
            base = {'dimension': 'DEPARTMENT_SERVICE', 'department': department, 'service': 'TOTAL'}
        elif label in SERVICES and department:
            base = {'dimension': 'DEPARTMENT_SERVICE', 'department': department, 'service': SERVICES[label]}
        else:
            continue
        add_years(points, row, columns, {**base, 'vehicleClass': None, 'capacityBand': None,
                                        'sourceKey': 'FLEET_DEPARTMENT_SERVICE'})
    return points


def fleet_service_class(path: Path) -> list[dict]:
    rows = sheet_rows(path); start, columns = year_columns(rows); points = []; current_service = None
    for row in rows[start + 1:]:
        label = fold(row[1] if len(row) > 1 else None)
        if label.startswith('FUENTE'): break
        if label == 'TOTAL':
            base = {'service': 'TOTAL', 'vehicleClass': 'TOTAL'}
        elif label in SERVICES and label != 'TOTAL':
            current_service = SERVICES[label]; base = {'service': current_service, 'vehicleClass': 'TOTAL'}
        elif label in CLASSES and current_service:
            base = {'service': current_service, 'vehicleClass': CLASSES[label]}
        else:
            continue
        add_years(points, row, columns, {'dimension': 'SERVICE_CLASS', 'department': None,
                  'capacityBand': None, 'sourceKey': 'FLEET_SERVICE_CLASS', **base})
    return points


def fleet_capacity(path: Path) -> list[dict]:
    rows = sheet_rows(path); start, columns = year_columns(rows); points = []
    current_service = None; current_class = None
    for row in rows[start + 1:]:
        label = fold(row[1] if len(row) > 1 else None)
        if label.startswith('FUENTE'): break
        if label == 'TOTAL':
            base = {'service': 'TOTAL', 'vehicleClass': 'TOTAL', 'capacityBand': 'TOTAL'}
        elif label in SERVICES and label != 'TOTAL':
            current_service = SERVICES[label]; current_class = None
            base = {'service': current_service, 'vehicleClass': 'TOTAL', 'capacityBand': 'TOTAL'}
        elif label in CLASSES and current_service:
            current_class = CLASSES[label]
            base = {'service': current_service, 'vehicleClass': current_class, 'capacityBand': 'TOTAL'}
        elif label in CAPACITIES and current_service and current_class:
            base = {'service': current_service, 'vehicleClass': current_class,
                    'capacityBand': CAPACITIES[label]}
        else:
            continue
        add_years(points, row, columns, {'dimension': 'SERVICE_CLASS_CAPACITY',
                  'department': None, 'sourceKey': 'FLEET_CAPACITY', **base})
    return points


def gnv_by_class(path: Path, metric: str, source_key: str) -> list[dict]:
    rows = sheet_rows(path); start, columns = year_columns(rows); points = []; department = None
    for row in rows[start + 1:]:
        label = fold(row[1] if len(row) > 1 else None)
        if label.startswith('FUENTE'): break
        if label == 'TOTAL':
            department = 'BOLIVIA'; vehicle_class = 'TOTAL'
        elif label in DEPARTMENTS and label not in {'TOTAL', 'BOLIVIA'}:
            department = DEPARTMENTS[label]; vehicle_class = 'TOTAL'
        elif label in CLASSES and department:
            vehicle_class = CLASSES[label]
        else:
            continue
        add_years(points, row, columns, {'metric': metric, 'dimension': 'DEPARTMENT_CLASS',
                  'department': department, 'vehicleClass': vehicle_class, 'sourceKey': source_key})
    return points


def gnv_quarters(path: Path, metric: str, source_key: str) -> list[dict]:
    rows = sheet_rows(path); header = next(i for i, row in enumerate(rows) if fold(row[1]) == 'PERIODO')
    columns = {i: DEPARTMENTS[fold(value)] for i, value in enumerate(rows[header])
               if fold(value) in DEPARTMENTS}
    points = []; year = None; preliminary = False
    quarters = {'I TRIMESTRE': 1, 'II TRIMESTRE': 2, 'III TRIMESTRE': 3, 'IV TRIMESTRE': 4}
    for row in rows[header + 1:]:
        raw = str(row[1] or '').replace(' ', ''); label = fold(row[1])
        match = re.fullmatch(r'(20\d{2})(?:\(p\))?', raw)
        if match:
            year = match.group(1); preliminary = '(p)' in raw; continue
        if label not in quarters or year is None: continue
        for column, department in columns.items():
            value = row[column] if column < len(row) else None
            if isinstance(value, (int, float)):
                points.append({'metric': metric, 'dimension': 'DEPARTMENT_QUARTER',
                    'department': department, 'vehicleClass': None,
                    'period': f'{year}-Q{quarters[label]}', 'value': int(value),
                    'preliminary': preliminary, 'sourceKey': source_key})
    return points


class TableRows(HTMLParser):
    def __init__(self) -> None:
        super().__init__(); self.in_cell = False; self.cell = []; self.row = []; self.rows = []

    def handle_starttag(self, tag, attrs):
        if tag in ('td', 'th'): self.in_cell = True; self.cell = []

    def handle_endtag(self, tag):
        if tag in ('td', 'th') and self.in_cell:
            self.row.append(' '.join(''.join(self.cell).split())); self.in_cell = False
        if tag == 'tr' and self.row: self.rows.append(self.row); self.row = []

    def handle_data(self, data):
        if self.in_cell: self.cell.append(data)


def clean_route(value: str) -> tuple[str, str]:
    road = 'NEW' if '(N)' in value.upper() else 'OLD' if '(A)' in value.upper() else 'DEFAULT'
    return fold(re.sub(r'\s*\([naNA]\)\s*$', '', value)), road


def fare(row, regulation: str, source_key: str) -> dict:
    destination, road = clean_route(str(row[1]))
    numbers = [int(value or 0) for value in row[2:8]]
    optional = lambda value: value if value > 0 else None
    return {
        'regulation': regulation,
        'publishedOn': '2013-10-21' if regulation == 'ATT_0178_2013' else '2025-12-31',
        'effectiveFrom': '2014-01-02' if regulation == 'ATT_0178_2013' else '2026-01-02',
        'effectiveUntil': None if regulation == 'ATT_0178_2013' else '2026-06-30',
        'origin': fold(row[0]), 'destination': destination, 'road': road, 'currency': 'BOB',
        'normalMin': numbers[0], 'normalMax': numbers[1],
        'semicamaMin': optional(numbers[2]), 'semicamaMax': optional(numbers[3]),
        'camaMin': optional(numbers[4]), 'camaMax': optional(numbers[5]), 'sourceKey': source_key,
    }


def fares_2013(path: Path) -> list[dict]:
    parser = TableRows(); parser.feed(path.read_text(encoding='utf-8', errors='replace'))
    rows = [row for row in parser.rows if len(row) == 8 and row[0] != 'Origen']
    return [fare(row, 'ATT_0178_2013', 'ATT_2013_ARCHIVE') for row in rows]


def sources(root: Path) -> list[dict]:
    output = []
    for key, (filename, publisher, title, url, status, note) in FILES.items():
        path = root / filename
        if not path.is_file(): raise FileNotFoundError(path)
        output.append({'key': key, 'publisher': publisher, 'title': title, 'url': url,
                       'sha256': digest(path), 'retrievedAt': RETRIEVED_AT,
                       'status': status, 'note': note})
    return output


def build(root: Path) -> dict:
    fleet = fleet_department_service(root / FILES['FLEET_DEPARTMENT_SERVICE'][0])
    fleet += fleet_service_class(root / FILES['FLEET_SERVICE_CLASS'][0])
    fleet += fleet_capacity(root / FILES['FLEET_CAPACITY'][0])
    gnv = gnv_quarters(root / FILES['GNV_QUARTER'][0], 'CONVERSION', 'GNV_QUARTER')
    gnv += gnv_by_class(root / FILES['GNV_TYPE'][0], 'CONVERSION', 'GNV_TYPE')
    gnv += gnv_quarters(root / FILES['GNV_REQUAL_QUARTER'][0], 'CYLINDER_REQUALIFICATION', 'GNV_REQUAL_QUARTER')
    gnv += gnv_by_class(root / FILES['GNV_REQUAL_TYPE'][0], 'CYLINDER_REQUALIFICATION', 'GNV_REQUAL_TYPE')
    bands = fares_2013(root / FILES['ATT_2013_ARCHIVE'][0])
    bands += [fare(row, 'ATT_0032_2025', 'ATT_2025_PDF') for row in ATT_2025_ROWS]
    if len(bands) != 60: raise ValueError(f'Expected 60 fare bands, got {len(bands)}')
    return {'dataset': 'bolivia-road-transport-economy', 'generatedAt': RETRIEVED_AT,
            'sources': sources(root), 'fleetPoints': fleet, 'gnvPoints': gnv, 'fareBands': bands}


def main() -> None:
    parser = argparse.ArgumentParser()
    parser.add_argument('--source-dir', type=Path, required=True)
    parser.add_argument('--output', type=Path, required=True)
    args = parser.parse_args()
    payload = build(args.source_dir)
    args.output.parent.mkdir(parents=True, exist_ok=True)
    args.output.write_text(json.dumps(payload, ensure_ascii=False, indent=2) + '\n', encoding='utf-8')
    print(f"{len(payload['fleetPoints'])} fleet, {len(payload['gnvPoints'])} GNV, "
          f"{len(payload['fareBands'])} fare readings -> {args.output}")


if __name__ == '__main__':
    main()
