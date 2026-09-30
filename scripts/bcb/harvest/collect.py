"""Recolector de las estadísticas del BCB: cuadernos públicos -> series -> semillas.

    python scripts/bcb/harvest/collect.py                # desde www.bcb.gob.bo
    python scripts/bcb/harvest/collect.py --local MAPA   # desde archivos ya bajados

Por cada informe (sus versiones se agrupan y se toma la última) extrae todas las hojas
que son series en el tiempo y escribe una semilla por familia en
`src/database/seeds/boot/bcb-statistics/`. No adivina nada que no esté en la celda: si una
hoja no dice de qué año es cada mes, o es un cuadro sin calendario, se deja fuera.

Escribe una familia solo si sus cifras cambiaron: el sitio vuelve a publicar el mismo
cuaderno con otro nombre y otra hora, y reescribir la semilla por eso es un despliegue.
Tampoco vuelve a bajar lo que no cambió: pregunta con `If-None-Match` y, si el sitio dice
que no, reutiliza las series ya sembradas de ese cuaderno.
"""
from __future__ import annotations

import argparse
import hashlib
import json
import re
import sys
import time
import urllib.parse
from collections import defaultdict
from datetime import datetime, timezone
from pathlib import Path

if __package__ in (None, ''):  # ejecutado como script
    sys.path.insert(0, str(Path(__file__).resolve().parents[1]))
    __package__ = 'harvest'

from .grid import load_grid  # noqa: E402
from .series import Series, extract, slug  # noqa: E402
from .shape import analyze_sheet  # noqa: E402
from .sources import (  # noqa: E402
    EXTRA,
    OUT,
    STATE,
    Local,
    Remote,
    discover,
    previous_by_url,
    prime_state,
    read_json,
)
from .versions import MONTHS, group_key, latest_versions  # noqa: E402

ROOT = Path(__file__).resolve().parents[3]
REGISTRY = Path(__file__).with_name('registry.json')

FAMILIES = [
    ('semanales', r'05_estadisticassemanales'),
    ('sistema-de-pagos', r'sistema_pagos'),
    ('sector-externo', r'sector_externo'),
    ('sector-monetario', r'sector_monetario'),
    ('precios', r'sector_precios'),
    ('tasas-de-interes', r'tasas_interes'),
    ('tipo-de-cambio', r'02_comvenmonext'),
    ('publicaciones', r'publicacionesbcb'),
]
_MONTH_WORD = '|'.join(sorted(MONTHS, key=len, reverse=True))


def family_of(url: str) -> str:
    path = urllib.parse.unquote(url)
    for name, pattern in FAMILIES:
        if re.search(pattern, path):
            return name
    return 'otros'


def stable_sheet(name: str) -> str:
    """El nombre de la hoja sin el mes ni el año: `ago2026` y `jul2026` son la misma."""
    folded = re.sub(rf'({_MONTH_WORD})[\s_.\-]*(?:19|20)?\d{{2}}\b', '', name.lower())
    folded = re.sub(rf'\b({_MONTH_WORD})\b', '', folded)
    return re.sub(r'\b(?:19|20)\d{2}\b', '', folded).strip() or 'hoja'


def series_code(family: str, group: str, sheet: str, name: str) -> str:
    identity = f'{group}|{stable_sheet(sheet)}|{name}'
    digest = hashlib.sha256(identity.encode()).hexdigest()[:8].upper()
    book = group.rsplit('/', 1)[-1]
    parts = [slug(family, 16), slug(book, 26), slug(stable_sheet(sheet), 22), slug(name, 28)]
    return 'BCB_' + '_'.join(p for p in parts if p) + '_' + digest


def workbook_series(url: str, data: bytes, retrieved_at: str) -> list[dict]:
    group = group_key(url)
    family = family_of(url)
    suffix = '.xls' if data[:4] == bytes([0xD0, 0xCF, 0x11, 0xE0]) else '.xlsx'
    tmp = ROOT / ('.bcb-statistics' + suffix)
    tmp.write_bytes(data)
    try:
        sheets = load_grid(str(tmp))
    finally:
        tmp.unlink(missing_ok=True)
    digest = hashlib.sha256(data).hexdigest()
    found: list[dict] = []
    for name, state, rows in sheets:
        info, detail = analyze_sheet(name, state, rows)
        for one in extract(info, detail):
            found.append(to_record(one, family, group, url, digest, retrieved_at))
    return found


def to_record(one: Series, family: str, group: str, url: str, digest: str, at: str) -> dict:
    return {
        'indicatorCode': series_code(family, group, one.sheet, one.name),
        'name': one.name[:200],
        'family': family,
        'workbook': group,
        'sheet': one.sheet[:120],
        'unit': (one.unit or '')[:120] or None,
        'frequency': one.frequency,
        'locator': one.locator,
        'sourceUrl': url,
        'upstreamSha256': digest,
        'retrievedAt': at,
        'points': [list(p) for p in one.points],
    }


def figures(records: list[dict]) -> str:
    """Lo que hace que una semilla cambie: las cifras, no cuándo ni de dónde se bajaron."""
    return json.dumps(
        [(r['indicatorCode'], r['name'], r['unit'], r['frequency'], r['points']) for r in records],
        sort_keys=True,
        ensure_ascii=False,
    )


def write_family(family: str, records: list[dict]) -> bool:
    path = OUT / f'{family}.json'
    records = sorted(records, key=lambda r: r['indicatorCode'])
    codes = [r['indicatorCode'] for r in records]
    if len(set(codes)) != len(codes):
        raise SystemExit(f'{family}: hay códigos de serie repetidos')
    if path.exists():
        before = json.loads(path.read_text(encoding='utf-8'))['series']
        if figures(before) == figures(records):
            return False
    OUT.mkdir(parents=True, exist_ok=True)
    body = json.dumps(
        {'family': family, 'series': records}, ensure_ascii=False, separators=(',', ':')
    )
    path.write_text(body + '\n', encoding='utf-8', newline='\n')
    return True


def main() -> int:
    parser = argparse.ArgumentParser()
    parser.add_argument('--local', help='JSON {direccion: ruta} de archivos ya bajados')
    parser.add_argument('--only', help='procesar solo las direcciones que contengan este texto')
    parser.add_argument('--pause', type=float, default=1.0, help='segundos entre descargas')
    parser.add_argument(
        '--prime-state',
        action='store_true',
        help='anotar las huellas actuales de los cuadernos sin bajarlos (HEAD)',
    )
    args = parser.parse_args()

    registry = read_json(REGISTRY, {'workbooks': [], 'pages': []})
    urls = list(registry['workbooks']) + read_json(EXTRA, {'workbooks': []})['workbooks']
    fetcher = (
        Local(json.loads(Path(args.local).read_text(encoding='utf-8'))) if args.local else Remote()
    )
    if not args.local:
        new = discover(fetcher, registry.get('pages', []), set(urls))
        if new:
            urls += new
            OUT.mkdir(parents=True, exist_ok=True)
            extra = read_json(EXTRA, {'workbooks': []})['workbooks'] + new
            body = json.dumps({'workbooks': sorted(set(extra))}, indent=1)
            EXTRA.write_text(body + '\n', encoding='utf-8')
            print(f'cuadernos nuevos en el sitio: {len(new)}')
    latest = latest_versions([u for u in urls if not args.only or args.only in u])
    if args.prime_state:
        prime_state(latest)
        return 0
    at = datetime.now(timezone.utc).strftime('%Y-%m-%dT%H:%M:%SZ')
    state: dict = read_json(STATE, {})
    kept = previous_by_url()

    by_family: dict[str, list[dict]] = defaultdict(list)
    failed: list[str] = []
    new_state: dict = {}
    for _, url in sorted(latest.items()):
        try:
            data, validators = fetcher.get(url, state.get(url) if kept.get(url) else None)
            records = kept[url] if data is None else workbook_series(url, data, at)
        except Exception as error:  # noqa: BLE001 - un cuaderno malo no tumba a los demás
            failed.append(f'{url}: {str(error)[:80]}')
            if kept.get(url):  # mejor la lectura de ayer que un hueco
                by_family[family_of(url)].extend(kept[url])
                new_state[url] = state.get(url, {})
            continue
        new_state[url] = validators
        for record in records:
            by_family[record['family']].append(record)
        if not args.local:
            time.sleep(args.pause)

    if not by_family:
        print('ningún cuaderno dio una sola serie: no se escribe nada', file=sys.stderr)
        return 1
    if args.only:
        # Un subconjunto sobrescribiría la familia entera con lo poco que leyó.
        total = sum(len(v) for v in by_family.values())
        print(f'--only: {total} series leídas; no se escribe ninguna semilla')
        return 0
    changed = [family for family, records in by_family.items() if write_family(family, records)]
    if not args.local and new_state != state:
        OUT.mkdir(parents=True, exist_ok=True)
        STATE.write_text(json.dumps(new_state, indent=1, sort_keys=True) + '\n', encoding='utf-8')
    total = sum(len(v) for v in by_family.values())
    points = sum(len(r['points']) for v in by_family.values() for r in v)
    print(
        f'{len(latest)} informes, {total} series, {points} puntos; '
        f'semillas nuevas: {changed or "ninguna"}'
    )
    for line in failed:
        print('sin leer:', line, file=sys.stderr)
    return 0


if __name__ == '__main__':
    raise SystemExit(main())
