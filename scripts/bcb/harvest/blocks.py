"""Tasas históricas del BCB por tipo de entidad: un cuadro con un bloque por período.

Los cuadros `30 DC` (tasas activas por destino del crédito) y `28 AH` (tasas pasivas de
ahorro y depósitos a plazo) traen la historia desde 2001 en un solo formato: encabezado de
moneda, destino y tasa nominal o efectiva; debajo, un bloque por período («SEM del 29/12/2025»,
«Ene 2010», «2001 PRIMER SEMESTRE», «2001») con una fila por tipo de entidad (bancos,
cooperativas, fondos financieros…). Hay un archivo por año —o uno anual con todos—, de modo que
la serie de un tipo de entidad se arma juntando el mismo bloque de todos los archivos.

Igual que en los cuadros por entidad (`cuts.py`), un cero es «sin operaciones» y no una tasa
de 0 %, y se descarta.
"""
from __future__ import annotations

import datetime as dt
import re
from collections import defaultdict

from . import cuts, feeds
from .grid import MES, clean, empty, parse_num, y2

WEEK = re.compile(r'^sem\s+del\s+(\d{1,2})/(\d{1,2})/(\d{2,4})$', re.I)
MONTH = re.compile(r'^([a-zñ]{3,10})[.\s-]+((?:19|20)\d{2})$', re.I)
ISO_MONTH = re.compile(r'^((?:19|20)\d{2})-(\d{2})-01(?: 00:00:00)?$')
SEMESTER = re.compile(r'^((?:19|20)\d{2})\s+(primer|segundo)\s+seme\w*$', re.I)
YEAR = re.compile(r'^((?:19|20)\d{2})$')
STOP = re.compile(r'^(\(\d|\*|FUENTE|ELABORACION|NOTA)')
TOTAL = 'TODAS LAS ENTIDADES'
CONCEPT_SKIP = ('(varios elementos)', '(todas)')
FREQUENCY_LABEL = {
    'WEEKLY': 'semanal',
    'MONTHLY': 'mensual',
    'SEMIANNUAL': 'semestral',
    'ANNUAL': 'anual',
}
FREQUENCY_TAG = {'WEEKLY': 'S', 'MONTHLY': 'M', 'SEMIANNUAL': 'H', 'ANNUAL': 'A'}
KIND_LABEL = {'ACT': 'Tasa activa histórica', 'PAS': 'Tasa pasiva histórica'}
LABELS = {
    'efect': 'Efectiva',
    'nomin': 'Nominal',
    'total efect': 'Total efectiva',
    'total nomin': 'Total nominal',
}
# Erratas del propio cuadro: el mismo tipo de entidad escrito mal en un año.
ENTITY_ALIASES = {
    'INSITUCIONES FINANCIERAS DE DESARROLLO': 'INSTITUCIONES FINANCIERAS DE DESARROLLO',
    'ENTIDADES FINANCIERAS DE VIVIEDA': 'ENTIDADES FINANCIERAS DE VIVIENDA',
    'ENTIDADES FINANCIERAS DE VIVIVENDA': 'ENTIDADES FINANCIERAS DE VIVIENDA',
    'BANCOS MULTILPLES': 'BANCOS MULTIPLES',
}
URL = re.compile(r'/webdocs/(?:tasas_interes/)?(30(?:%20| )?DC|28(?:%20| )?AH|B28)', re.I)


def is_block_url(url: str) -> bool:
    return bool(URL.search(url))


def period_of(text: str) -> tuple[dt.date, str] | None:
    """(fecha, frecuencia) del rótulo de un bloque, o None si el texto no es un período."""
    label = clean(text)
    try:
        week = WEEK.match(label)
        if week:
            day, month, year = week.groups()
            return dt.date(y2(year), int(month), int(day)), 'WEEKLY'
        month = MONTH.match(label)
        if month and month.group(1).lower() in MES:
            return dt.date(int(month.group(2)), MES[month.group(1).lower()], 1), 'MONTHLY'
        iso = ISO_MONTH.match(label)  # una celda de fecha: el primero del mes
        if iso:
            return dt.date(int(iso.group(1)), int(iso.group(2)), 1), 'MONTHLY'
        half = SEMESTER.match(label)
        if half:
            return dt.date(int(half.group(1)), 1 if half.group(2).lower() == 'primer' else 7, 1), 'SEMIANNUAL'
        year = YEAR.match(label)
        if year:
            return dt.date(int(year.group(1)), 1, 1), 'ANNUAL'
    except ValueError:
        return None
    return None


def tidy(label: str) -> str:
    """El rótulo de columna sin abreviaturas del cuadro dinámico ni mayúsculas sostenidas."""
    text = clean(label)
    known = LABELS.get(cuts.fold(text).lower())
    if known:
        return known
    if text.isupper():
        text = text.capitalize()
    return text


def kind_of(rows: list[list]) -> str | None:
    for row in rows[:6]:
        for value in row:
            if isinstance(value, str):
                text = cuts.fold(value).upper()
                if 'TASAS DE INTERES' in text:
                    if 'ACTIV' in text:
                        return 'ACT'
                    if 'PASIV' in text:
                        return 'PAS'
    return None


def _is_credit(row: list) -> bool:
    """La línea de autoría del cuadro («Gerencia de Entidades Financieras…») no es un encabezado."""
    return any(isinstance(v, str) and v.strip().lower().startswith(('gerencia', 'subgerencia', 'elaboraci')) for v in row)


def _metadata(rows: list[list], upto: int) -> list[str]:
    """«Denominación: MONEDA NACIONAL», «Concepto de la Operación: DEPOSITOS A PLAZO»…"""
    found = []
    for row in rows[:upto]:
        cells = [(j, v) for j, v in enumerate(row) if not empty(v)]
        if len(cells) == 2 and cells[0][0] == 0:
            name, value = cuts.fold(cells[0][1]).lower(), clean(cells[1][1])
            if name in ('denominacion', 'concepto de la operacion') and value.lower() not in CONCEPT_SKIP:
                found.append(tidy(value))
    return found


def read_sheet(rows: list[list]) -> list[tuple[str, str, str, str, str, float]]:
    """[(tipo, entidad, columna, fecha, frecuencia, tasa)] de una hoja de bloques por período."""
    kind = kind_of(rows)
    if kind is None:
        return []
    first = next(
        (
            i
            for i, row in enumerate(rows)
            if row and not empty(row[0]) and period_of(str(row[0]))
            and not any(parse_num(v) is not None for v in row[1:])
        ),
        None,
    )
    if first is None:
        return []
    header = [r for r in rows[:first] if sum(not empty(v) for v in r[1:]) >= 2 and not _is_credit(r)]
    if not header:
        return []
    parts = cuts.column_paths(header, 0, len(header) - 1, 0)
    meta = _metadata(rows, first)
    paths = {
        j: ' | '.join([*meta, *[tidy(p) for p in labels if tidy(p).lower() not in ('destinos',)]])
        for j, labels in parts.items()
    }
    out: list = []
    current = None
    seen: set[tuple] = set()
    for row in rows[first:]:
        label = clean(row[0]) if row and not empty(row[0]) else ''
        if not label:
            continue
        found = period_of(label)
        has_numbers = any(parse_num(v) is not None for v in row[1:])
        if found:
            current = found
            if not has_numbers:
                continue
        if not has_numbers or current is None:
            continue
        # La fila que abre un mes con cifras es el total de todas las entidades en ese mes.
        name = TOTAL if found else cuts.entity_name(label)
        if STOP.match(name):
            continue
        name = ENTITY_ALIASES.get(name, name)
        if (current, name) in seen:  # un nombre repetido en un bloque: se queda el primero
            continue
        seen.add((current, name))
        for j, path in paths.items():
            number = parse_num(row[j]) if j < len(row) else None
            if number is not None and number != 0:
                out.append((kind, name, path, current[0].isoformat(), current[1], float(number)))
    return out


def collect(batch: list[tuple[str, dict[str, list[list]]]]) -> dict[tuple, dict[str, float]]:
    """De cuadros [(versión, {hoja: filas})] a {(tipo, frecuencia, entidad, columna): {fecha: tasa}}."""
    out: dict[tuple, dict[str, float]] = defaultdict(dict)
    for _, sheets in batch:
        for rows in sheets.values():
            for kind, entity, column, day, frequency, rate in read_sheet(rows):
                out[(kind, frequency, entity, column)][day] = rate
    return out


def _name(key: tuple) -> str:
    kind, frequency, entity, column = key
    return f'{KIND_LABEL[kind]} · {entity} · {column} ({FREQUENCY_LABEL[frequency]})'


FEED = feeds.Feed(
    family='tasas-historicas',
    prefix='BCB_TASASH',
    state='_blocks.json',
    page='https://www.bcb.gob.bo/?q=tasas_interes',
    wants=is_block_url,
    read=collect,
    name_of=_name,
    workbook_of=lambda key: f'tasas_interes/{key[0]} históricas ({FREQUENCY_LABEL[key[1]]})',
    sheet_of=lambda key: key[0],
    locator_of=lambda key: {
        'tipo': key[0],
        'frecuencia': key[1],
        'entidad': key[2],
        'columna': key[3],
    },
    key_of=lambda where: (where['tipo'], where['frecuencia'], where['entidad'], where['columna']),
    tag_of=lambda key: f'{key[0]}_{FREQUENCY_TAG[key[1]]}',
)
