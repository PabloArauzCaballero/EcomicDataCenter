#!/usr/bin/env python3
"""Lee la longitud oficial de caminos (INE, con cifras de la ABC y los SEDECA).

Tres cuadros del INE, 2000-2024, en kilometros: por red y rodadura para el
pais, por departamento y rodadura, y por departamento y red. Los tres repiten
el total nacional; cada punto se guarda una sola vez por su clave.

`2022(p)`, `2023(p)` y `2024(p)` son preliminares y se marcan asi en cada punto:
el INE puede corregirlos y el lector tiene que saberlo antes de leer la
pendiente de los tres ultimos anos.

La ABC es quien mide y no quien publica aqui: su portal devolvia un error de
WordPress el 2026-09-23 y la transitabilidad pide un captcha, asi que la cifra
oficial llega por el cuadro del INE, que la cita como fuente.
"""

from __future__ import annotations

import hashlib
import re

import openpyxl

GEOGRAPHY = {
    'TOTAL': 'BOLIVIA', 'CHUQUISACA': 'CHUQUISACA', 'LA PAZ': 'LA_PAZ',
    'COCHABAMBA': 'COCHABAMBA', 'ORURO': 'ORURO', 'POTOSÍ': 'POTOSI', 'POTOSI': 'POTOSI',
    'TARIJA': 'TARIJA', 'SANTA CRUZ': 'SANTA_CRUZ', 'BENI': 'BENI', 'PANDO': 'PANDO',
}
NETWORK = {'FUNDAMENTAL': 'FUNDAMENTAL', 'DEPARTAMENTAL': 'DEPARTAMENTAL'}
SURFACE = {
    'PAVIMENTO': 'PAVIMENTO', 'EMPEDRADO': 'EMPEDRADO', 'RIPIO': 'RIPIO', 'TIERRA': 'TIERRA',
    'EN CONSTRUCCIÓN': 'EN_CONSTRUCCION', 'TRAZO EN EVALUACIÓN DE ALTERNATIVAS': 'TRAZO_EN_EVALUACION',
}


def sha256_of(path: str) -> str:
    with open(path, 'rb') as handle:
        return hashlib.sha256(handle.read()).hexdigest()


def read_table(path: str, layout: str, url: str, retrieved_at: str) -> list[dict]:
    """`layout`: 'network-surface' (pais), 'department-surface' o 'department-network'."""
    sheet = openpyxl.load_workbook(path, data_only=True).worksheets[0]
    rows = [row for row in sheet.iter_rows(values_only=True) if any(cell is not None for cell in row)]
    header = next(row for row in rows if row[1] and str(row[1]).startswith(('RED', 'DEPARTAMENTO')))
    periods = [(index, str(cell)) for index, cell in enumerate(header) if cell is not None and index > 1]
    digest = sha256_of(path)
    points, group = [], None
    for row in rows:
        label = str(row[1] or '').strip().upper()
        if row is header or not label or not isinstance(row[2], (int, float)):
            continue
        # En el cuadro del pais los grupos son las redes; en los otros dos, los
        # departamentos, y alli «Fundamental» es una fila y no un grupo.
        groups = ('TOTAL', *NETWORK) if layout == 'network-surface' else tuple(GEOGRAPHY)
        is_group = label in groups
        if is_group:
            group = label
        geography, network, surface = 'BOLIVIA', 'TOTAL', 'TOTAL'
        if layout == 'network-surface':
            network = NETWORK.get(group, 'TOTAL')
            surface = 'TOTAL' if is_group else SURFACE[label]
        elif layout == 'department-surface':
            geography = GEOGRAPHY[group]
            surface = 'TOTAL' if is_group else SURFACE[label]
        else:
            geography = GEOGRAPHY[group]
            network = 'TOTAL' if is_group else NETWORK[label]
        for index, period in periods:
            cell = row[index]
            if not isinstance(cell, (int, float)):
                continue
            year = re.match(r'\d{4}', period).group(0)
            points.append({
                'geography': geography, 'network': network, 'surface': surface,
                'period': year, 'lengthKm': round(float(cell), 3),
                'preliminary': '(p)' in period,
                'sourceUrl': url, 'upstreamSha256': digest, 'retrievedAt': retrieved_at,
                'excerpt': f'{label} {period}: {cell}',
            })
    return points


def read_lengths(tables: list[tuple[str, str, str]], retrieved_at: str) -> list[dict]:
    """Los tres cuadros, sin repetir un punto que dos de ellos publican."""
    held: dict[tuple, dict] = {}
    for path, layout, url in tables:
        for point in read_table(path, layout, url, retrieved_at):
            key = (point['geography'], point['network'], point['surface'], point['period'])
            held.setdefault(key, point)
    return sorted(held.values(), key=lambda p: (p['geography'], p['network'], p['surface'], p['period']))


def read_itineraries(wikitext: str) -> list[dict]:
    """El itinerario de cada ruta fundamental, tal como lo lista Wikipedia."""
    routes = []
    for block in wikitext.split('\n|-')[1:]:
        number = re.search(r'Ruta_(\d+)_\(Bolivia\)', block)
        cells = [cell.strip() for cell in block.split('\n|') if cell.strip()]
        if not number or len(cells) < 3:
            continue
        text = re.sub(r'\[\[(?:[^|\]]*\|)?([^\]]*)\]\]', r'\1', cells[-1])
        text = re.sub(r"'''|<[^>]+>", '', text)
        text = re.sub(r'\s+', ' ', text).strip(' |')
        routes.append({'route': f'F-{int(number.group(1))}', 'itinerary': text[:600]})
    return routes
