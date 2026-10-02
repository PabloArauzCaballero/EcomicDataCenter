"""Cuadros de día × mes: una fila por día del mes, una columna por mes y año.

El tipo de cambio oficial y la UFV diaria vienen así: el 1.º, el 2.º… el 31 bajan por la
izquierda, los meses corren a la derecha bajo su año. Cada celda es una fecha exacta, y la
serie diaria sale de recorrerlas en orden. Un cuadro con dos valores por mes (`Compra` y
`Venta` bajo cada mes) da una serie por cada uno.

Solo se leen las celdas que el cuaderno llena: un día que no existe (30 de febrero) o que no
tiene cifra se omite. Un mes cuyo año el encabezado no dice no se lee.
"""
from __future__ import annotations

import calendar
import datetime as dt

from .grid import MES, clean, empty, find_unit, is_month_name, parse_num
from .series import Series, column_letter, plain

MIN_MONTHS = 6


def _month_row(rows: list[list]) -> int | None:
    for i, row in enumerate(rows[:30]):
        if sum(is_month_name(v) for v in row) >= MIN_MONTHS:
            return i
    return None


def _years(rows: list[list], month_row: int) -> dict[int, int]:
    """Columna -> año, de la fila de años que está sobre los meses."""
    for i in range(month_row - 1, max(-1, month_row - 6), -1):
        found = {}
        for j, value in enumerate(rows[i]):
            number = parse_num(value)
            if number is not None and float(number).is_integer() and 1950 <= number <= 2100:
                found[j] = int(number)
        if found:
            return found
    return {}


def _day_column(rows: list[list], first: int, before: int) -> int | None:
    for j in range(before):
        days = [parse_num(r[j]) if j < len(r) else None for r in rows[first:]]
        run = [int(d) for d in days if d is not None and float(d).is_integer() and 1 <= d <= 31]
        if len(run) >= 28 and run[:5] == [1, 2, 3, 4, 5]:
            return j
    return None


def read(rows: list[list], sheet: str, book: str) -> list[Series]:
    """Las series diarias de una hoja de día × mes, o nada si la hoja no tiene esa forma."""
    top = _month_row(rows)
    if top is None:
        return []
    years = _years(rows, top)
    month_columns = [j for j, v in enumerate(rows[top]) if is_month_name(v)]
    if not years or not month_columns:
        return []
    day_column = _day_column(rows, top + 1, month_columns[0])
    if day_column is None:
        return []
    # El rótulo bajo cada mes («Compra», «Venta»), si lo hay, distingue las columnas de un mes.
    labels: dict[int, str] = {}
    below = rows[top + 1] if top + 1 < len(rows) else []
    for j, value in enumerate(below):
        if j > day_column and isinstance(value, str) and clean(value) and not is_month_name(value):
            labels[j] = clean(value)
    first_data = top + 1 + (1 if labels else 0)
    width = max(len(r) for r in rows)
    columns: list[tuple[int, int, int, str]] = []  # columna, año, mes, rótulo
    for j in range(month_columns[0], width):
        month_at = max((m for m in month_columns if m <= j), default=None)
        left = [c for c in years if c <= (month_at if month_at is not None else j)]
        if month_at is None or not left:
            continue
        number = MES[clean(rows[top][month_at]).lower().rstrip('.')]
        columns.append((j, years[max(left)], number, labels.get(j, '')))
    title = _title(rows, top)
    unit = find_unit(rows[:top])
    grouped: dict[str, dict[str, str]] = {}
    spots: dict[str, list[int]] = {}
    for j, year, month, label in columns:
        for r in range(first_data, len(rows)):
            row = rows[r]
            day = parse_num(row[day_column]) if day_column < len(row) else None
            if day is None or not float(day).is_integer() or not 1 <= day <= 31:
                continue
            if int(day) > calendar.monthrange(year, month)[1]:
                continue
            value = parse_num(row[j]) if j < len(row) else None
            if value is None:
                continue
            when = dt.date(year, month, int(day)).isoformat()
            grouped.setdefault(label, {})[when] = plain(value)
            spots.setdefault(label, []).append(j)
    found = []
    for label, points in grouped.items():
        if len(points) < 2:
            continue
        ordered = sorted(points.items())
        base = f'{book} · {title}' if book and book.lower() not in title.lower() else title
        found.append(
            Series(
                f'{base} · {label}' if label else base,
                sheet,
                'DAILY',
                unit,
                {
                    'orientation': 'matrix',
                    'firstColumn': column_letter(min(spots[label])),
                    'lastColumn': column_letter(max(spots[label])),
                    'firstRow': first_data + 1,
                    'lastRow': len(rows),
                },
                ordered,
            )
        )
    return found


def _title(rows: list[list], top: int) -> str:
    """El título del cuadro: el texto más largo de la cabecera que no es una unidad ni un número."""
    texts = [
        clean(v)
        for row in rows[:top]
        for v in row
        if isinstance(v, str) and clean(v) and not empty(v)
    ]
    texts = [t for t in texts if not t.lower().startswith(('(en', 'cuadro', 'fuente', 'elabor'))]
    texts = [t for t in texts if parse_num(t) is None and t.lower() not in ('día', 'dia', 'días', 'dias')]
    return max(texts, key=len)[:120].capitalize() if texts else 'Cuadro diario'
