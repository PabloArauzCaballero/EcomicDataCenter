"""Recolector de las subastas del BCB: informes semanales «O&M» -> series.

    python scripts/bcb/harvest/collect_omas.py
    python scripts/bcb/harvest/collect_omas.py --local MAPA

Un informe ya publicado no cambia: se baja una vez, se lee y lo leído se guarda en
`_omas_records.json`, junto a la semilla. Cada corrida solo baja los informes que todavía
no están ahí (los semanales nuevos) y reconstruye las series con todo lo guardado.
"""
from __future__ import annotations

import argparse
import hashlib
import io
import json
import logging
import re
import sys
import time
import urllib.parse
from datetime import datetime, timezone
from pathlib import Path

if __package__ in (None, ''):  # ejecutado como script
    sys.path.insert(0, str(Path(__file__).resolve().parents[1]))
    __package__ = 'harvest'

import pypdf  # noqa: E402

from .omas import Award, build_series, parse_awards  # noqa: E402
from .sources import OUT, Local, Remote, read_json  # noqa: E402

logging.disable(logging.CRITICAL)

REGISTRY = Path(__file__).with_name('registry.json')
RECORDS = OUT / '_omas_records.json'
FAMILY_FILE = OUT / 'operaciones-de-mercado-abierto.json'
PAGES = 8  # los informes semanales tienen seis hojas; las subastas van en las primeras


def text_of(data: bytes) -> str:
    reader = pypdf.PdfReader(io.BytesIO(data))
    pages = []
    for page in reader.pages[:PAGES]:
        try:
            pages.append(re.sub(r'[ \t]+', ' ', page.extract_text() or ''))
        except Exception:  # noqa: BLE001 - una hoja ilegible no tumba el informe
            pages.append('')
    return '\n'.join(pages)


def is_weekly_report(url: str) -> bool:
    name = urllib.parse.unquote(url).rsplit('/', 1)[-1].upper()
    return '002_OMAS' in url.upper() and name.startswith('O&M')


def main() -> int:
    parser = argparse.ArgumentParser()
    parser.add_argument('--local', help='JSON {direccion: ruta} de archivos ya bajados')
    parser.add_argument('--pause', type=float, default=1.0)
    args = parser.parse_args()

    registry = read_json(REGISTRY, {'pdfs': []})
    urls = sorted({u for u in registry.get('pdfs', []) if is_weekly_report(u)})
    fetcher = (
        Local(json.loads(Path(args.local).read_text(encoding='utf-8'))) if args.local else Remote()
    )
    saved: dict = read_json(RECORDS, {})
    failed: list[str] = []
    for url in urls:
        if url in saved:
            continue
        try:
            data, _ = fetcher.get(url)
            awards, unread = parse_awards(text_of(data or b''))
        except Exception as error:  # noqa: BLE001
            failed.append(f'{url}: {str(error)[:70]}')
            continue
        saved[url] = {
            'sha256': hashlib.sha256(data or b'').hexdigest(),
            'unread': unread,
            'awards': [a.__dict__ for a in awards],
        }
        if not args.local:
            time.sleep(args.pause)

    every = [Award(**a) for entry in saved.values() for a in entry['awards']]
    if not every:
        print('ningún informe dio una adjudicación: no se escribe nada', file=sys.stderr)
        return 1
    # Una subasta aparece en varios informes (el de su semana y los de las siguientes):
    # el último gana, y todos traen la misma cifra.
    digest = hashlib.sha256(json.dumps(sorted(saved), sort_keys=True).encode()).hexdigest()
    at = datetime.now(timezone.utc).strftime('%Y-%m-%dT%H:%M:%SZ')
    source = 'https://www.bcb.gob.bo/?q=content/operaciones-de-mercado-abierto'
    series = sorted(build_series(every, source, digest, at), key=lambda s: s['indicatorCode'])
    OUT.mkdir(parents=True, exist_ok=True)
    RECORDS.write_text(json.dumps(saved, sort_keys=True) + '\n', encoding='utf-8')
    before = read_json(FAMILY_FILE, {'series': []})['series']
    figures = lambda rows: json.dumps([(r['indicatorCode'], r['points']) for r in rows])  # noqa: E731
    if figures(before) != figures(series):
        body = json.dumps(
            {'family': 'operaciones-de-mercado-abierto', 'series': series},
            ensure_ascii=False, separators=(',', ':'),
        )
        FAMILY_FILE.write_text(body + '\n', encoding='utf-8', newline='\n')
    unread = sum(entry['unread'] for entry in saved.values())
    print(f'{len(saved)} informes, {len(every)} adjudicaciones, {len(series)} series, {unread} filas sin leer')
    for line in failed:
        print('sin leer:', line, file=sys.stderr)
    return 0


if __name__ == '__main__':
    raise SystemExit(main())
