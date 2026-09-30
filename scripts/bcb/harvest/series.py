"""De la forma de una hoja a sus series con puntos.

Cada serie lleva de dónde salió —hoja, columna o fila, filas de datos— porque una cifra
que nadie puede volver a encontrar en el cuaderno no sirve de evidencia. Los valores se
guardan como texto decimal sin exponente: lo que dice el cuaderno, no un flotante que
pueda haberse movido un paso de redondeo.
"""
from __future__ import annotations

import decimal
import re
import unicodedata
from dataclasses import dataclass, field

from .grid import clean, parse_num

FREQUENCY = {
    'diaria': 'DAILY',
    'semanal': 'WEEKLY',
    'mensual': 'MONTHLY',
    'trimestral': 'QUARTERLY',
    'semestral': 'SEMIANNUAL',
    'anual': 'ANNUAL',
}

_UNIT_NOTE = re.compile(r'^\(?\s*en\s', re.I)
_UNIT_TAIL = re.compile(
    r'\(([^()]*(?:Bs|\$us|us\$|%|millones|miles|indice|índice|toneladas|kilos|puntos|base)[^()]*)\)\s*$',
    re.I,
)


@dataclass
class Series:
    name: str
    sheet: str
    frequency: str
    unit: str | None
    locator: dict
    points: list[tuple[str, str]] = field(default_factory=list)


def plain(value: float) -> str:
    """Un decimal sin exponente: `1e-05` se escribe 0.00001."""
    text = format(decimal.Decimal(repr(float(value))), 'f')
    if '.' in text:
        text = text.rstrip('0').rstrip('.')
    return text or '0'


def column_letter(index: int) -> str:
    letters = ''
    index += 1
    while index:
        index, rest = divmod(index - 1, 26)
        letters = chr(65 + rest) + letters
    return letters


def slug(text: str, limit: int = 60) -> str:
    """Mayúsculas ASCII separadas por guion bajo: el trozo de un código de serie."""
    folded = unicodedata.normalize('NFKD', text).encode('ascii', 'ignore').decode()
    return re.sub(r'[^A-Z0-9]+', '_', folded.upper()).strip('_')[:limit]


def _unique(name: str, column: int, seen: set[str]) -> str:
    """Un nombre único dentro de la hoja: dos columnas pueden llamarse igual."""
    base = name.strip() or f'columna {column_letter(column)}'
    candidate, count = base, 1
    while candidate in seen:
        count += 1
        candidate = f'{base} ({count})'
    seen.add(candidate)
    return candidate


def _unit_of(name: str, sheet_unit: str | None) -> str | None:
    """La unidad que el propio nombre declara entre paréntesis, o la de la hoja."""
    tail = _UNIT_TAIL.search(name)
    return tail.group(1).strip() if tail else sheet_unit


def _coherent(graded: list[tuple[str, str, str]]) -> list[tuple[str, str]]:
    """Los puntos de una serie, o nada si no se puede confiar en sus fechas.

    Cada renglón dice su período con la granularidad que el cuaderno usó (día, mes, año).
    Un año que termina con una fila «2000» y un valor no dice si es diciembre o el promedio
    anual: es un punto anual metido en una serie mensual. No se adivina: se descartan los
    puntos de la granularidad minoritaria, y si con eso las fechas siguen sin avanzar
    —un año mal asignado— la serie entera se deja fuera en vez de publicar cifras bajo
    un año que puede no ser el suyo.
    """
    if not graded:
        return []
    counts: dict[str, int] = {}
    for _, _, grain in graded:
        counts[grain] = counts.get(grain, 0) + 1
    dominant = max(counts, key=lambda grain: counts[grain])
    points = [(date, value) for date, value, grain in graded if grain == dominant]
    dates = [date for date, _ in points]
    if any(later <= earlier for earlier, later in zip(dates, dates[1:])):
        return []
    return points


def extract(info: dict, detail: dict | None) -> list[Series]:
    """Las series de una hoja, o nada si la hoja no dice de qué año es cada mes."""
    if not detail or not info.get('utilizable') or info.get('aviso'):
        return []
    frequency = FREQUENCY.get(info.get('frecuencia') or '', 'MIXED')
    unit = info.get('unidad')
    sheet = info['nombre']
    out: list[Series] = []
    seen: set[str] = set()
    rows = detail['rows']
    if detail['shape'] == 'columns':
        rp, idx = detail['rp'], detail['idx']
        for (column, _), name in zip(detail['cols'], detail['names']):
            graded = []
            for i in idx:
                value = parse_num(rows[i][column])
                if value is not None:
                    graded.append((rp[i][0].isoformat(), plain(value), rp[i][1]))
            points = _coherent(graded)
            if len(points) >= 2:
                unique = _unique(name, column, seen)
                out.append(
                    Series(
                        unique,
                        sheet,
                        frequency,
                        _unit_of(unique, unit),
                        {
                            'orientation': 'columns',
                            'valueColumn': column_letter(column),
                            'firstRow': idx[0] + 1,
                            'lastRow': idx[-1] + 1,
                        },
                        points,
                    )
                )
    elif detail['shape'] == 'rows':
        cps, pcols = detail['cps'], detail['pcols']
        for row, *_ in detail['lab']:
            graded = []
            for column in pcols:
                value = parse_num(rows[row][column])
                if value is not None:
                    graded.append((cps[column][0].isoformat(), plain(value), cps[column][1]))
            points = _coherent(graded)
            if len(points) >= 2:
                out.append(
                    Series(
                        '',
                        sheet,
                        frequency,
                        unit,
                        {
                            'orientation': 'rows',
                            'row': row + 1,
                            'firstColumn': column_letter(pcols[0]),
                            'lastColumn': column_letter(pcols[-1]),
                        },
                        points,
                    )
                )
        _name_rows(out, rows, pcols, seen)
    return out


def _name_rows(found: list[Series], rows: list, pcols: list[int], seen: set[str]) -> None:
    """Da nombre a las series por filas con el camino de cabeceras que las antecede.

    Un cuadro del BCB anida sus renglones: «Valor de las operaciones MN» en una columna y,
    debajo, una partida por renglón en la siguiente. El nombre de la fila es ese camino y
    no solo su última etiqueta: sin él, «Transferencias interbancarias» del valor en MN y
    en ME serían la misma serie. Una fila que solo dice «(En millones de Bolivianos)» no es
    una partida sino la unidad de la cabecera que la precede, y así se trata.
    """
    if not found:
        return
    left = range(0, pcols[0])
    wanted = {s.locator['row'] - 1: s for s in found}
    headers: dict[int, list[str]] = {}
    block_unit: tuple[int, str] | None = None  # (columna, unidad) que rige los renglones de abajo
    for index, row in enumerate(rows[: max(wanted) + 1]):
        texts = {c: clean(row[c]) for c in left if isinstance(row[c], str) and clean(row[c])}
        if not texts:
            continue
        has_numbers = any(parse_num(row[c]) is not None for c in pcols if c < len(row))
        if not has_numbers:
            for column, text in texts.items():
                headers[column] = (headers.get(column, []) + [text])[-2:]
            if block_unit and min(texts) <= block_unit[0]:
                block_unit = None  # otra cabecera del mismo nivel abre otro bloque
            continue
        one = wanted.get(index)
        if one is None:
            continue
        label_column = max(texts)
        label = texts[label_column]
        parts = [t for c in sorted(headers) if c < label_column for t in headers[c]]
        if _UNIT_NOTE.match(label):
            parts = parts + headers.get(label_column, [])
            one.unit = label.strip('() ')
            block_unit = (label_column, one.unit)
        else:
            parts.append(label)
        one.name = _unique(' | '.join(dict.fromkeys(parts)), label_column, seen)
        if not _UNIT_NOTE.match(label):
            one.unit = _unit_of(one.name, block_unit[1] if block_unit else one.unit)
    for one in found:
        if not one.name:
            one.name = _unique('', 0, seen)
