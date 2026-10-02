"""Recolector de las subastas del BCB: informes «O&M» y resultados de cada subasta -> series.

    python scripts/bcb/harvest/collect_omas.py
    python scripts/bcb/harvest/collect_omas.py --local MAPA

Hay dos clases de informe y las dos dan adjudicaciones:

- el semanal «O&M», con una sección «ADJUDICACIÓN DE VALORES DE LA SUBASTA DE FECHA …»;
- el resultado de cada subasta (`LR MN- 17-2026 Desmat_TR.pdf`), que trae cada serie con su
  promedio de adjudicación y se lee en modo «layout» para que las columnas no se peguen.

Un informe ya publicado no cambia: se baja una vez, se lee y lo leído se guarda en
`_omas_records.json`, junto a la semilla. Cada corrida mira las primeras hojas de los
listados del sitio, baja solo los informes que todavía no están ahí y reconstruye las series
con todo lo guardado.
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

from .omas import Award, build_series, parse_awards, parse_results  # noqa: E402
from .sources import OUT, Local, Remote, read_json  # noqa: E402

logging.disable(logging.CRITICAL)

REGISTRY = Path(__file__).with_name('registry.json')
FOUND = OUT / '_omas_registry.json'  # informes que el sitio publicó después del registro
RECORDS = OUT / '_omas_records.json'
FAMILY_FILE = OUT / 'operaciones-de-mercado-abierto.json'
PAGES = 8  # los informes semanales tienen seis hojas; las subastas van en las primeras
LISTING_PAGES = ('', '&page=1')  # las dos hojas más nuevas de cada listado


def text_of(data: bytes, layout: bool = False) -> str:
    reader = pypdf.PdfReader(io.BytesIO(data))
    pages = []
    for page in reader.pages[:PAGES]:
        try:
            if layout:
                pages.append(page.extract_text(extraction_mode='layout') or '')
            else:
                pages.append(re.sub(r'[ \t]+', ' ', page.extract_text() or ''))
        except Exception:  # noqa: BLE001 - una hoja ilegible no tumba el informe
            pages.append('')
    return '\n'.join(pages)


def kind_of(url: str) -> str | None:
    """`weekly` para el informe semanal, `result` para el de una subasta, None para lo demás."""
    if '002_OMAS' not in url.upper() or not url.lower().endswith('.pdf'):
        return None
    name = urllib.parse.unquote(url).rsplit('/', 1)[-1]
    if name.upper().startswith('O&M'):
        return 'weekly'
    return 'result' if re.search(r'desmat', name, re.I) else None


def discover(fetcher, pages: list[str], known: set[str]) -> list[str]:
    """Informes que los listados del BCB enlazan y todavía no se conocen."""
    found: list[str] = []
    for page in pages:
        for suffix in LISTING_PAGES:
            try:
                html = fetcher.page(page + suffix)
            except Exception:  # noqa: BLE001 - una hoja caída no impide leer las demás
                continue
            for href in re.findall(r'href="([^"#]+\.pdf)"', html, flags=re.I):
                url = urllib.parse.urljoin(page, href.replace('&amp;', '&'))
                if kind_of(url) and url not in known:
                    known.add(url)
                    found.append(url)
            time.sleep(0.5)
    return found


def main() -> int:
    parser = argparse.ArgumentParser()
    parser.add_argument('--local', help='JSON {direccion: ruta} de archivos ya bajados')
    parser.add_argument('--pause', type=float, default=1.0)
    args = parser.parse_args()

    registry = read_json(REGISTRY, {'pdfs': []})
    later: list[str] = read_json(FOUND, {'pdfs': []})['pdfs']
    known = {*registry.get('pdfs', []), *registry.get('resultPdfs', []), *later}
    fetcher = (
        Local(json.loads(Path(args.local).read_text(encoding='utf-8'))) if args.local else Remote()
    )
    if not args.local:
        pages = [*registry.get('omasPages', [])[:1], *registry.get('resultPages', [])]
        new = discover(fetcher, pages, set(known))
        if new:
            later = sorted({*later, *new})
            known |= set(new)
            OUT.mkdir(parents=True, exist_ok=True)
            FOUND.write_text(json.dumps({'pdfs': later}, indent=1) + '\n', encoding='utf-8', newline='\n')
            print(f'informes nuevos en el sitio: {len(new)}')
    urls = sorted(u for u in known if kind_of(u))
    saved: dict = read_json(RECORDS, {})
    failed: list[str] = []
    for url in urls:
        if url in saved:
            continue
        try:
            data, _ = fetcher.get(url)
            if kind_of(url) == 'result':
                awards, unread = parse_results(text_of(data or b'', layout=True))
            else:
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

    # Una subasta aparece en varios informes (el de su semana y el de su resultado): el último
    # gana. Los resultados van al final porque traen el promedio de la serie entera, mientras
    # que el semanal trae un renglón por adjudicación.
    ordered = sorted(saved, key=lambda u: (kind_of(u) == 'result', u))
    every = [Award(**a) for url in ordered for a in saved[url]['awards']]
    if not every:
        print('ningún informe dio una adjudicación: no se escribe nada', file=sys.stderr)
        return 1
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
    print(f'{len(saved)} informes, {len(every)} adjudicaciones, {len(series)} series, {unread} sin leer')
    for line in failed:
        print('sin leer:', line, file=sys.stderr)
    return 0


if __name__ == '__main__':
    raise SystemExit(main())
