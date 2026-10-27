"""Resuelve un enlace corto de Google Maps (maps.app.goo.gl / goo.gl/maps) que publica la propia fuente.

No es geocodificar: se sigue la redireccion del enlace que el publicador puso en
su pagina y se lee la coordenada que ese enlace ya trae (!3d<lat>!4d<lon>, @lat,lon,
o q=lat,lon). Si el destino no trae coordenada, devuelve None.
"""
import re
import ssl
import urllib.parse
import urllib.request

from common import UA


class _NoRedirect(urllib.request.HTTPRedirectHandler):
    def redirect_request(self, req, fp, code, msg, headers, newurl):  # noqa: D401
        return None


def _location(url):
    opener = urllib.request.build_opener(_NoRedirect, urllib.request.HTTPSHandler(context=ssl.create_default_context()))
    try:
        opener.open(urllib.request.Request(url, headers={'User-Agent': UA}), timeout=30)
    except urllib.error.HTTPError as exc:
        if exc.code in (301, 302, 303, 307, 308):
            return exc.headers.get('Location')
    return None


def coords_from_url(url):
    text = urllib.parse.unquote(url or '')
    m = re.search(r'!3d(-?\d+\.\d+)!4d(-?\d+\.\d+)', text)
    if m:
        return m.group(1), m.group(2), 'place_pin_3d4d'
    m = re.search(r'[?&](?:q|query|ll|destination)=(-?\d+\.\d+),\s*\+?(-?\d+\.\d+)', text)
    if m:
        return m.group(1), m.group(2), 'query_latlon'
    m = re.search(r'/place/(-?\d+\.\d+),\s*\+?(-?\d+\.\d+)', text)
    if m:
        return m.group(1), m.group(2), 'place_latlon'
    m = re.search(r'@(-?\d+\.\d+),(-?\d+\.\d+)', text)
    if m:
        return m.group(1), m.group(2), 'viewport_center'
    return None


def resolve(url, hops=5):
    """Devuelve (url_final, (lat, lon, metodo) | None)."""
    current = url
    for _ in range(hops):
        found = coords_from_url(current)
        if found and 'goo.gl' not in current:
            return current, found
        nxt = _location(current)
        if not nxt:
            break
        current = urllib.parse.urljoin(current, nxt)
    return current, coords_from_url(current)
