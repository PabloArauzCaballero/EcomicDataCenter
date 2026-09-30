#!/usr/bin/env python3
"""Lee el flujo del transporte ferroviario que publica el INE, 1999 en adelante.

Un cuadro, una hoja: por red (Andina y Oriental) y tipo de servicio
(pasajeros en personas; carga y equipaje-encomienda en toneladas metricas),
con una fila por ano y debajo sus doce meses. El INE cita como fuente a la
Empresa Ferroviaria Andina y a la Empresa Ferroviaria Oriental.

Un ano que el cuadro marca `(p)` es preliminar y cada punto lo lleva: el INE
lo puede corregir. El ano en curso trae solo los meses publicados, y su fila
de total es la suma de esos meses, no un ano completo: se guarda con
`partialYear` para que ninguna grafica lo compare con un ano cerrado.
"""

from __future__ import annotations

import hashlib
import re

import openpyxl

MONTHS = ['enero', 'febrero', 'marzo', 'abril', 'mayo', 'junio', 'julio', 'agosto',
          'septiembre', 'octubre', 'noviembre', 'diciembre']
# Columna -> (red, servicio, unidad), en el orden del encabezado del cuadro.
COLUMNS = {
    2: ('ANDINA', 'PASAJEROS', 'PERSONAS'), 3: ('ANDINA', 'CARGA', 'TONELADAS'),
    4: ('ANDINA', 'EQUIPAJE_ENCOMIENDA', 'TONELADAS'),
    5: ('ORIENTAL', 'PASAJEROS', 'PERSONAS'), 6: ('ORIENTAL', 'CARGA', 'TONELADAS'),
    7: ('ORIENTAL', 'EQUIPAJE_ENCOMIENDA', 'TONELADAS'),
}


def check_header(rows) -> None:
    """El cuadro tiene que seguir teniendo las columnas donde este lector las busca."""
    networks = next(row for row in rows if row[1] == 'PERIODO')
    services = rows[rows.index(networks) + 1]
    assert 'ANDINA' in str(networks[2]).upper() and 'ORIENTAL' in str(networks[5]).upper(), networks
    for column, (_, service, _) in COLUMNS.items():
        head = str(services[column]).upper()
        assert service.split('_')[0][:5] in head, (column, head)


def read_flows(path: str, url: str, retrieved_at: str) -> list[dict]:
    with open(path, 'rb') as handle:
        digest = hashlib.sha256(handle.read()).hexdigest()
    sheet = openpyxl.load_workbook(path, data_only=True).worksheets[0]
    rows = [row for row in sheet.iter_rows(values_only=True)]
    check_header(rows)
    points, year, preliminary = [], None, False
    months_seen: dict[str, int] = {}
    for row in rows:
        label = row[1]
        if label is None:
            continue
        text = str(label).strip()
        year_match = re.fullmatch(r'(\d{4})\s*(\(p\))?', text)
        if year_match:
            year, preliminary = year_match.group(1), bool(year_match.group(2))
            period = year
        elif year and text.lower() in MONTHS:
            month = MONTHS.index(text.lower()) + 1
            period = f'{year}-{month:02d}'
            months_seen[year] = max(months_seen.get(year, 0), month)
        else:
            continue
        for column, (network, service, unit) in COLUMNS.items():
            value = row[column]
            if not isinstance(value, (int, float)):
                continue
            points.append({
                'network': network, 'service': service, 'unit': unit,
                'period': period, 'value': round(float(value), 3),
                'preliminary': preliminary,
                'sourceUrl': url, 'upstreamSha256': digest, 'retrievedAt': retrieved_at,
                'excerpt': f'{text} {network} {service}: {value}',
            })
    for point in points:
        point['partialYear'] = len(point['period']) == 4 and months_seen.get(point['period'], 12) < 12
    return points
