"""Series que se arman juntando muchos cuadros publicados por separado.

Hay informes del BCB que no traen su historia: publican un cuadro nuevo cada día, cada semana
o cada año, y la serie de una entidad se arma juntando la misma celda de todos. El recolector
normal toma la última versión de cada informe y descartaría los demás; este acumulador lee
cada cuadro una sola vez, guarda su huella y suma sus puntos a lo ya sembrado.

Cada fuente (`Feed`) dice qué direcciones le tocan, cómo se lee un cuadro y cómo se nombra
una serie; lo demás —el estado, los puntos sueltos, la semilla— es común. La clave de una
serie es una tupla de texto `(…, frecuencia, entidad, columna)`: la frecuencia va siempre
en el segundo lugar.
"""
from __future__ import annotations

import hashlib
import re
import sys
import time
import unicodedata
from collections import defaultdict
from dataclasses import dataclass
from typing import Callable

from .series import plain


@dataclass(frozen=True)
class Feed:
    family: str
    prefix: str
    state: str  # nombre del archivo de estado dentro de la carpeta de semillas
    page: str  # la página del BCB que lista los cuadros: es la `sourceUrl` de la serie
    wants: Callable[[str], bool]
    read: Callable[[list], dict]  # [(dirección, {hoja: filas})] -> {clave: {fecha: valor}}
    name_of: Callable[[tuple], str]
    workbook_of: Callable[[tuple], str]
    sheet_of: Callable[[tuple], str]
    locator_of: Callable[[tuple], dict]  # clave -> lo que la identifica en la hoja
    key_of: Callable[[dict], tuple]  # locator -> clave (lo contrario de `locator_of`)
    tag_of: Callable[[tuple], str]
    unit: str = '%'


def _slug(text: str, limit: int) -> str:
    folded = unicodedata.normalize('NFKD', text).encode('ascii', 'ignore').decode()
    return re.sub(r'[^A-Z0-9]+', '_', folded.upper()).strip('_')[:limit]


def code_of(feed: Feed, key: tuple) -> str:
    digest = hashlib.sha256('|'.join(key).encode()).hexdigest()[:8].upper()
    parts = [feed.prefix, feed.tag_of(key), _slug(key[-2], 26), _slug(key[-1], 40), digest]
    return '_'.join(p for p in parts if p)


def records_of(
    feed: Feed, acc: dict, manifest: dict[str, str], at: str
) -> tuple[list[dict], list[list]]:
    """(series, sueltos): las series con dos puntos o más y los puntos de las que aún no llegan.

    La semilla pide al menos dos puntos por serie; el que está solo se guarda aparte y se
    une a la serie cuando llega el siguiente cuadro.
    """
    digest = hashlib.sha256(
        '\n'.join(f'{url} {sha}' for url, sha in sorted(manifest.items())).encode()
    ).hexdigest()
    records: list[dict] = []
    single: list[list] = []
    for key in sorted(acc):
        points = sorted(acc[key].items())
        if len(points) < 2:
            single.extend([*key, day, rate] for day, rate in points)
            continue
        records.append(
            {
                'indicatorCode': code_of(feed, key),
                'name': feed.name_of(key)[:200],
                'family': feed.family,
                'workbook': feed.workbook_of(key)[:300],
                'sheet': feed.sheet_of(key)[:120],
                'unit': feed.unit,
                'frequency': key[1],
                'locator': {
                    **feed.locator_of(key),
                    'cuadros': len(points),
                    'primer_cuadro': points[0][0],
                    'ultimo_cuadro': points[-1][0],
                },
                'sourceUrl': feed.page,
                'upstreamSha256': digest,
                'retrievedAt': at,
                'points': [[day, plain(rate)] for day, rate in points],
            }
        )
    return records, single


def accumulated(feed: Feed, records: list[dict], single: list[list]) -> dict:
    """Lo ya sembrado vuelto a la forma de trabajo, para añadirle los cuadros nuevos."""
    acc: dict[tuple, dict[str, float]] = defaultdict(dict)
    for record in records:
        key = feed.key_of(record['locator'])
        for day, rate in record['points']:
            acc[key][day] = float(rate)
    for *key, day, rate in single:
        acc[tuple(key)][day] = float(rate)
    return acc


def sheets_of(data: bytes) -> dict[str, list[list]]:
    """Las hojas de un cuadro descargado: {nombre: filas}."""
    import os
    import tempfile

    from .grid import load_grid

    suffix = '.xls' if data[:4] == bytes([0xD0, 0xCF, 0x11, 0xE0]) else '.xlsx'
    handle, name = tempfile.mkstemp(suffix=suffix)
    try:
        with os.fdopen(handle, 'wb') as file:
            file.write(data)
        return {sheet: rows for sheet, _, rows in load_grid(name)}
    finally:
        os.unlink(name)


def update(feed: Feed, fetcher, urls: list[str], at: str, pause: float = 1.0):
    """Suma a la semilla los cuadros que todavía no se leyeron.

    Devuelve `(series, estado)` o `None` si no había cuadros nuevos. Cada cuadro se lee una
    sola vez —el BCB no corrige los publicados— y su huella queda en el estado; si la
    descarga falla se reintenta en la corrida siguiente. Lo ya sembrado se conserva: la
    historia no se vuelve a bajar.
    """
    from .sources import OUT, read_json
    from .versions import version_key

    state = read_json(OUT / feed.state, {'files': {}, 'single': []})
    fresh = sorted(
        (u for u in set(urls) if feed.wants(u) and u not in state['files']), key=version_key
    )
    if not fresh:
        return None
    batch: list[tuple[str, dict[str, list[list]]]] = []
    files = dict(state['files'])
    for url in fresh:
        try:
            data, _ = fetcher.get(url, None)
            if data is None:
                continue
            batch.append((url, sheets_of(data)))
            files[url] = hashlib.sha256(data).hexdigest()
        except Exception as error:  # noqa: BLE001 - un cuadro caído no tumba a los demás
            print(f'cuadro sin leer: {url}: {str(error)[:80]}', file=sys.stderr)
        if pause:
            time.sleep(pause)
    if not batch:
        return None
    previous = read_json(OUT / f'{feed.family}.json', {'series': []})['series']
    acc = accumulated(feed, previous, state['single'])
    for key, points in feed.read(batch).items():
        acc[key].update(points)
    records, single = records_of(feed, acc, files, at)
    return records, {'files': files, 'single': single}
