"""Tasas activas y pasivas del BCB: un cuadro por día o por semana, convertido en series.

El BCB no publica la historia de estas tasas en un cuaderno: publica un cuadro nuevo cada
día hábil (`TD_24 09 2026.xlsx`) o cada semana (`PUBLICACION 2026 09 07 TASAS ACT Y PAS.xlsx`),
con una hoja de tasas activas (`ACT`) y otra de pasivas (`PAS`), una fila por entidad y una
columna por moneda y producto. Cada cuadro es una sola fecha; la serie de una entidad se
arma juntando la misma celda de todos los cuadros.

Tres decisiones que no están en la celda y hay que declarar:

- **El cero es «sin operaciones», no una tasa de 0 %.** Son promedios ponderados por monto:
  una entidad que no colocó ni captó en ese producto en el cuadro sale con 0. Se descarta
  el punto en vez de dibujar una caída a cero que nunca ocurrió.
- **Diario y semanal son series distintas.** El promedio de una semana no es el valor de un
  día; se guardan con su frecuencia y no se mezclan.
- **Los rótulos se unifican, no se inventan.** El BCB escribe `Moneda nacional` y `Moneda
  Nacional`, `Micro-crédito` y `Microcrédito`; son el mismo rótulo. Un plazo mal escrito
  (`qq` entre 30 y 90) solo se corrige si entre sus vecinos cabe un único plazo de la
  escalera oficial; si no, la columna de ese cuadro se descarta.
"""
from __future__ import annotations

import datetime as dt
import re
import unicodedata
from collections import defaultdict

from . import feeds
from .grid import MES, clean, empty, parse_num

SECTION = re.compile(r'^(BANCOS|ENTIDADES|COOPERATIVAS|INSTITUCIONES|IFD$)')
STOP = re.compile(r'^(\(\d|\*|FUENTE|TASAS DE INTERES DE REFERENCIA|NOTA)')
HEADER_ECHO = re.compile(r'^(PLAZO|TASA)\b')
TEXT_DAY = re.compile(r'(\d{1,2})\s*de\s+([a-záéíóú]+)\s+(?:de|del)\s+(\d{4})', re.I)
WEEK = re.compile(
    r'semana\s+del\s+\d{1,2}\s*(?:de\s+[a-záéíóú]+)?\s*(?:de\s+\d{4})?\s*al\s+'
    r'(\d{1,2})\s*de\s+([a-záéíóú]+)\s+(?:de|del)\s+(\d{4})',
    re.I,
)
KINDS = {'ACT': 'Tasa activa', 'PAS': 'Tasa pasiva'}
LADDER = (30, 60, 90, 180, 360, 720, 1080)

# Rótulos de columna: sin tildes ni mayúsculas, a su forma única.
COLUMN_LABELS = {
    'moneda nacional': 'Moneda nacional',
    'moneda extranjera': 'Moneda extranjera',
    'ufv': 'UFV',
    'mvdol': 'MVDOL',
    'empresarial': 'Empresarial',
    'pyme': 'PYME',
    'micro-credito': 'Microcrédito',
    'microcredito': 'Microcrédito',
    'consumo': 'Consumo',
    'vivienda': 'Vivienda',
    'hipotecario de vivienda': 'Vivienda',
    'promedio': 'Promedio',
    'caja de ahorro': 'Caja de ahorro',
    'depositos a plazo fijo (dias)': 'Depósito a plazo fijo',
    'mayor': 'Mayor',
}

# Entidades que el BCB escribe de dos maneras o que cambiaron de figura legal sin cambiar de
# institución (un fondo financiero privado que pasó a banco). Lo demás se deja como viene.
ENTITY_ALIASES = {
    'CRISTO REY CBBA': 'CRISTO REY COCHABAMBA',
    'MAG RURAL CHUQUISACA': 'MAG. RURAL CHUQUISACA',
    'SAN PEDRO AIQUILE': 'SAN PEDRO DE AIQUILE',
    'SC BORROMEO': 'S.C BORROMEO',
    'J. NAZARENO': 'JESUS NAZARENO',
    'MERCANTIL SCZ': 'MERCANTIL SANTA CRUZ',
    'EL PROGRESO': 'PROGRESO',
    'BANCO FIE': 'FIE',
    'BANCO SOLIDARIO': 'SOLIDARIO',
    'BANCO FORTALEZA': 'FORTALEZA',
    'FORTALEZA FFP': 'FORTALEZA',
    'PRODEM FFP': 'PRODEM',
    'ECO FUTURO FFP': 'ECO FUTURO',
    'COMUNIDAD FFP': 'DE LA COMUNIDAD',
}


def fold(value) -> str:
    text = unicodedata.normalize('NFKD', clean(value)).encode('ascii', 'ignore').decode()
    return re.sub(r'\s+', ' ', text).strip()


def entity_name(value) -> str:
    """El nombre de la entidad sin tildes y en mayúsculas, con sus variantes unificadas."""
    name = fold(value).upper()
    return ENTITY_ALIASES.get(name, name)


def _date(day: str, month: str, year: str) -> dt.date | None:
    number = MES.get(month.lower().rstrip('.'))
    if not number:
        return None
    try:
        return dt.date(int(year), number, int(day))
    except ValueError:
        return None


def cut_date(rows: list[list]) -> tuple[dt.date, str] | None:
    """(fecha, 'DAILY'|'WEEKLY') del cuadro; en uno semanal, el último día de la semana."""
    for row in rows[:16]:
        for value in row:
            if not isinstance(value, str):
                continue
            text = clean(value)
            week = WEEK.search(text)
            if week:
                found = _date(*week.groups())
                if found:
                    return found, 'WEEKLY'
            day = TEXT_DAY.search(text)
            if day and 'semana' not in text.lower():
                found = _date(*day.groups())
                if found:
                    return found, 'DAILY'
    return None


def _label(value) -> str:
    """El rótulo único de una columna: los plazos sueltos (30, 60…) son días."""
    if not isinstance(value, str):
        number = parse_num(value)
        if number is not None and float(number).is_integer():
            return f'{int(number)} días'
    text = clean(value)
    if re.fullmatch(r'\d+', text):
        return f'{text} días'
    return COLUMN_LABELS.get(fold(text).lower(), text)


def _term(label: str) -> int | None:
    found = re.fullmatch(r'(\d+) días', label)
    return int(found.group(1)) if found else None


def column_paths(rows: list[list], first: int, last: int, label_column: int = 0) -> dict[int, list[str]]:
    """Columna -> ['Moneda nacional', 'Depósito a plazo fijo', '30 días'].

    Los rótulos de arriba abarcan varias columnas (celdas combinadas): se arrastran hacia la
    derecha hasta que otro rótulo del mismo nivel o de un nivel superior empieza.
    """
    width = max((len(rows[i]) for i in range(first, last + 1)), default=0)
    levels = [list(rows[i]) + [None] * (width - len(rows[i])) for i in range(first, last + 1)]
    start = label_column + 1
    paths: dict[int, list[str]] = {j: [] for j in range(start, width)}
    for depth, level in enumerate(levels):
        carried = None
        for j in range(start, width):
            if any(not empty(upper[j]) for upper in levels[:depth]):
                carried = None
            if not empty(level[j]):
                carried = _label(level[j])
            if carried and (not paths[j] or paths[j][-1] != carried):
                paths[j].append(carried)
    return {j: parts for j, parts in paths.items() if parts}


def repair_terms(paths: dict[int, list[str]]) -> dict[int, list[str]]:
    """Un plazo mal escrito toma el único plazo de la escalera que cabe entre sus vecinos."""
    by_prefix: dict[tuple, list[int]] = defaultdict(list)
    for j, parts in paths.items():
        if len(parts) >= 3 and parts[-2] == 'Depósito a plazo fijo':
            by_prefix[tuple(parts[:-1])].append(j)
    fixed = dict(paths)
    for columns in by_prefix.values():
        columns.sort()
        for index, j in enumerate(columns):
            last = fixed[j][-1]
            if _term(last) is not None or last == 'Mayor':
                continue
            before = _term(fixed[columns[index - 1]][-1]) if index > 0 else None
            after = _term(fixed[columns[index + 1]][-1]) if index + 1 < len(columns) else None
            between = [t for t in LADDER if before and after and before < t < after]
            if len(between) == 1:
                fixed[j] = fixed[j][:-1] + [f'{between[0]} días']
            else:
                del fixed[j]
    return fixed


def read_cut(rows: list[list]) -> list[tuple[str, str, float]]:
    """[(entidad, columna, tasa)] de una hoja ACT o PAS; sin los ceros de «sin operaciones»."""
    head = label = None
    for i, row in enumerate(rows):
        spot = next((j for j, v in enumerate(row[:4]) if fold(v).lower() == 'entidades'), None)
        if spot is not None:
            head, label = i, spot
            break
    if head is None or label is None:
        return []

    def name_at(row: list) -> str:
        return entity_name(row[label]) if len(row) > label and not empty(row[label]) else ''

    # El encabezado llega hasta la primera sección («BANCOS MULTIPLES»).
    start = next(
        (i for i in range(head + 1, len(rows)) if SECTION.match(name_at(rows[i]))), len(rows)
    )
    paths = repair_terms(column_paths(rows, head, start - 1, label))
    found: list[tuple[str, str, float]] = []
    seen: set[str] = set()
    for row in rows[start:]:
        name = name_at(row)
        if not name:
            continue
        if STOP.match(name):
            break
        if SECTION.match(name) or HEADER_ECHO.match(name):
            continue
        if name in seen:  # un nombre repetido en la hoja no se adivina: se queda el primero
            continue
        seen.add(name)
        for j, parts in paths.items():
            number = parse_num(row[j]) if j < len(row) else None
            if number is not None and number != 0:
                found.append((name, ' | '.join(parts), float(number)))
    return found


def collect(cuts: list[tuple[str, dict[str, list[list]]]]) -> dict[tuple, dict[str, float]]:
    """De cuadros [(versión, {hoja: filas})] a {(tipo, frecuencia, entidad, columna): {fecha: tasa}}.

    Los cuadros llegan de la versión más vieja a la más nueva: si dos traen la misma fecha
    (el BCB republica un cuadro corregido), gana el último. La fecha de un cuadro se lee de
    cualquiera de sus hojas: la otra hoja del mismo archivo es del mismo día.
    """
    out: dict[tuple, dict[str, float]] = defaultdict(dict)
    for _, sheets in cuts:
        when = next((w for w in (cut_date(rows) for rows in sheets.values()) if w), None)
        if not when:
            continue
        day, frequency = when
        for sheet, rows in sheets.items():
            kind = sheet.strip().upper()
            if kind not in KINDS:
                continue
            for entity, column, rate in read_cut(rows):
                out[(kind, frequency, entity, column)][day.isoformat()] = rate
    return out


# ---------------------------------------------------------------------------------------
# La fuente de los cuadros diarios y semanales para el acumulador de `feeds`.
# ---------------------------------------------------------------------------------------

CUT_URL = re.compile(
    r'/webdocs/tasas_interes/(TD_|TASAS(?:%20| )DIARIAS|PUBLICACION|publicacion\d|TASAS(?:%20| )ACT)',
    re.I,
)
FREQUENCY_LABEL = {'DAILY': 'diaria', 'WEEKLY': 'semanal'}
FREQUENCY_TAG = {'DAILY': 'D', 'WEEKLY': 'S'}


def is_cut_url(url: str) -> bool:
    return bool(CUT_URL.search(url))


def _name(key: tuple) -> str:
    kind, frequency, entity, column = key
    return f'{KINDS[kind]} · {entity} · {column} ({FREQUENCY_LABEL[frequency]})'


def _locator(key: tuple) -> dict:
    kind, frequency, entity, column = key
    return {'tipo': kind, 'frecuencia': frequency, 'entidad': entity, 'columna': column}


FEED = feeds.Feed(
    family='tasas-por-entidad',
    prefix='BCB_TASAS',
    state='_cuts.json',
    page='https://www.bcb.gob.bo/?q=tasas_interes',
    wants=is_cut_url,
    read=collect,
    name_of=_name,
    workbook_of=lambda key: f'tasas_interes/{key[0]} {FREQUENCY_LABEL[key[1]]}s',
    sheet_of=lambda key: key[0],
    locator_of=_locator,
    key_of=lambda where: (where['tipo'], where['frecuencia'], where['entidad'], where['columna']),
    tag_of=lambda key: f'{key[0]}_{FREQUENCY_TAG[key[1]]}',
)
