"""Todo lo que sale a la red o guarda estado: bajar, preguntar «¿cambió?», descubrir.

Aparte del recolector para que este no pase del tamaño que el repositorio permite y para
poder probar la lectura de cuadernos sin red.
"""
from __future__ import annotations

import json
import re
import sys
import time
import urllib.error
import urllib.parse
import urllib.request
from collections import defaultdict
from pathlib import Path

OUT = Path(__file__).resolve().parents[3] / 'src' / 'database' / 'seeds' / 'boot' / 'bcb-statistics'
STATE = OUT / '_state.json'
EXTRA = OUT / '_registry.json'
USER_AGENT = 'Mozilla/5.0 (compatible; ObservatorioEconomico/1.0; datosbolivia.com)'
KEEP = re.compile(
    r'/webdocs/(05_estadisticassemanales|sistema_pagos|sector_externo|sector_monetario|'
    r'sector_precios|tasas_interes|02_comvenmonext|publicacionesbcb|Documentos(?:%20| )Adjuntos)/',
    re.I,
)
ADMIN = re.compile(
    r'Form_|Formulario|F3160|FCIS|encuestaservicios|riof|licitaciones|serviciosbcb|Cronograma|'
    r'Solicitud|MesaDePartes|poappto|pac/|open_bcb|institucional|01_resoluciones|transparencia',
    re.I,
)


def encoded(url: str) -> str:
    """La dirección con espacios y tildes codificados: `Depósitos` no viaja como ASCII."""
    return urllib.parse.quote(url, safe=":/?&=%#+,;@!$'()*~")


def read_json(path: Path, default):
    return json.loads(path.read_text(encoding='utf-8')) if path.exists() else default


class Remote:
    @staticmethod
    def _request(url: str, headers: dict) -> urllib.request.Request:
        return urllib.request.Request(
            encoded(url), headers={'User-Agent': USER_AGENT, **headers}
        )

    def get(self, url: str, validators: dict | None = None):
        """(datos, validadores), o (None, validadores) si el sitio dice que no cambió."""
        headers = {}
        if validators and validators.get('etag'):
            headers['If-None-Match'] = validators['etag']
        if validators and validators.get('lastModified'):
            headers['If-Modified-Since'] = validators['lastModified']
        try:
            with urllib.request.urlopen(self._request(url, headers), timeout=90) as response:
                fresh = {
                    'etag': response.headers.get('ETag'),
                    'lastModified': response.headers.get('Last-Modified'),
                }
                return response.read(), fresh
        except urllib.error.HTTPError as error:
            if error.code == 304:
                return None, validators or {}
            raise

    def page(self, url: str) -> str:
        with urllib.request.urlopen(self._request(url, {}), timeout=60) as response:
            return response.read().decode('utf-8', 'replace')


class Local:
    """Archivos ya bajados: un mapa {direccion: ruta} para probar sin salir a la red."""

    def __init__(self, mapping: dict[str, str]):
        self.mapping = mapping

    def get(self, url: str, validators: dict | None = None):
        return Path(self.mapping[url]).read_bytes(), {}

    def page(self, url: str) -> str:
        return ''


def discover(fetcher, pages: list[str], known: set[str]) -> list[str]:
    """Cuadernos que las páginas del BCB enlazan y el registro todavía no conoce."""
    found: list[str] = []
    for page in pages:
        try:
            html = fetcher.page(page)
        except Exception:  # noqa: BLE001 - una página caída no impide leer las demás
            continue
        for href in re.findall(r'href="([^"#]+\.xlsx?)"', html, flags=re.I):
            url = urllib.parse.urljoin(page, href.replace('&amp;', '&'))
            decoded = urllib.parse.unquote(url)
            if KEEP.search(url) and not ADMIN.search(decoded) and url not in known:
                known.add(url)
                found.append(url)
        time.sleep(0.5)
    return found


def previous_by_url() -> dict[str, list[dict]]:
    """Lo ya sembrado, por cuaderno: se reutiliza cuando el sitio dice «no cambió»."""
    kept: dict[str, list[dict]] = defaultdict(list)
    if OUT.exists():
        for path in sorted(OUT.glob('[a-z]*.json')):
            for record in read_json(path, {'series': []})['series']:
                kept[record['sourceUrl']].append(record)
    return kept


def prime_state(latest: dict[str, str]) -> None:
    """Las huellas de cada cuaderno tal como están ahora, sin descargarlos.

    Sirve cuando las semillas ya se leyeron de esos mismos archivos por otra vía: el
    primer lote en el servidor pregunta «¿cambió?» en vez de bajar doscientos cuadernos
    de un sitio lento.
    """
    state: dict = read_json(STATE, {})
    for _, url in sorted(latest.items()):
        request = urllib.request.Request(
            encoded(url), headers={'User-Agent': USER_AGENT}, method='HEAD'
        )
        try:
            with urllib.request.urlopen(request, timeout=60) as response:
                state[url] = {
                    'etag': response.headers.get('ETag'),
                    'lastModified': response.headers.get('Last-Modified'),
                }
        except Exception as error:  # noqa: BLE001
            print('sin huella:', url, str(error)[:60], file=sys.stderr)
        time.sleep(0.3)
    OUT.mkdir(parents=True, exist_ok=True)
    STATE.write_text(json.dumps(state, indent=1, sort_keys=True) + '\n', encoding='utf-8')
    print(f'{len(state)} huellas anotadas')
