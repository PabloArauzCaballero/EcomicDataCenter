"""Agrupar las versiones de un mismo informe y quedarse con la más reciente.

El BCB no reemplaza el cuaderno: publica otro con la fecha en el nombre
(`Semanal 38_2026`, `Reporte Estadístico a Agosto 2026`) y cada uno trae la historia
completa. Cargar los doce sería doce veces la misma serie; hay que reconocer que son la
misma y tomar la última. El grupo se arma con el nombre sin números, sin meses y sin las
carpetas con fecha; la versión se ordena por los números que el nombre lleva.
"""
from __future__ import annotations

import re
import unicodedata
import urllib.parse

MONTHS = {
    'enero': 1, 'febrero': 2, 'marzo': 3, 'abril': 4, 'mayo': 5, 'junio': 6, 'julio': 7,
    'agosto': 8, 'septiembre': 9, 'setiembre': 9, 'octubre': 10, 'noviembre': 11,
    'diciembre': 12, 'ene': 1, 'feb': 2, 'mar': 3, 'abr': 4, 'may': 5, 'jun': 6, 'jul': 7,
    'ago': 8, 'sep': 9, 'sept': 9, 'oct': 10, 'nov': 11, 'dic': 12,
}
_MONTH_WORD = '|'.join(sorted(MONTHS, key=len, reverse=True))
_NOISE = re.compile(r'\b(vf|v\d+|final|web|rev\w*)\b')


def _path(url: str) -> str:
    return urllib.parse.unquote(urllib.parse.urlparse(url).path).split('/webdocs/', 1)[-1]


def _fold(text: str) -> str:
    return unicodedata.normalize('NFKD', text).encode('ascii', 'ignore').decode().lower()


def group_key(url: str) -> str:
    """El informe al que pertenece un cuaderno, sin fecha ni versión."""
    directory, _, name = _path(url).rpartition('/')
    directory = re.sub(r'/?\d{4}/\d{2}/\d{2}', '', directory)
    name = re.sub(r'\.xlsx?$', '', _fold(name), flags=re.I)
    name = re.sub(r'\(\d+\)', '', name)
    name = _NOISE.sub('', name)
    name = re.sub(rf'\b({_MONTH_WORD})\b', '', name)
    name = re.sub(r'\d+', '', name)
    name = re.sub(r'[^a-z]+', ' ', name).strip()
    return f'{directory}/{name}'


def version_key(url: str) -> tuple:
    """Orden de las versiones: año primero, después mes o semana, después día."""
    path = _fold(_path(url))
    # Fecha completa en el nombre: «TD_24 09 2026» es el 24 de septiembre.
    full = re.search(r'(\d{1,2})[ _.\-](\d{1,2})[ _.\-](20\d{2})', path)
    if full:
        return (int(full.group(3)), int(full.group(2)), (int(full.group(1)),), path)
    numbers = [int(n) for n in re.findall(r'\d+', path)]
    months = [MONTHS[m] for m in re.findall(rf'\b({_MONTH_WORD})\b', path)]
    years = [n for n in numbers if 1990 <= n <= 2100]
    rest = [n for n in numbers if not 1990 <= n <= 2100]
    if not years and months and rest:
        # «Diciembre 24»: el año de dos cifras que acompaña al mes.
        years, rest = [2000 + rest[-1]], rest[:-1]
    return (max(years) if years else 0, months[-1] if months else 0, tuple(rest), path)


def latest_versions(urls: list[str]) -> dict[str, str]:
    """Para cada informe, la dirección de su versión más reciente."""
    groups: dict[str, list[str]] = {}
    for url in urls:
        groups.setdefault(group_key(url), []).append(url)
    return {key: max(members, key=version_key) for key, members in groups.items()}
