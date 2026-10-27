"""Busca la pagina «lista-direcciones-page» de la plantilla AGETIC en muchos sitios .gob.bo.

Uso: python -I gobbo_discover.py dominio1 dominio2 ...
Imprime: dominio, url que respondio, numero de tarjetas «Nombre de oficina:».
"""
import os
import sys
from concurrent.futures import ThreadPoolExecutor

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
from common import decode, fetch  # noqa: E402


def probe(domain):
    found = []
    for prefix in (f'https://{domain}', f'https://www.{domain}' if not domain.startswith('www.') else None):
        if not prefix:
            continue
        for path in ('/index.php/lista-direcciones-page/', '/lista-direcciones-page/', '/pagina-de-direcciones'):
            try:
                html = decode(fetch(prefix + path, timeout=25, tries=1))
            except Exception as exc:  # noqa: BLE001
                found.append(f'{prefix}{path} ERR {type(exc).__name__} {str(exc)[:60]}')
                continue
            n = html.count('Nombre de oficina:')
            found.append(f'{prefix}{path} OK cards={n}')
            if n:
                return domain, found[-1]
    return domain, ' | '.join(found[-2:])


with ThreadPoolExecutor(2) as pool:
    for domain, line in pool.map(probe, sys.argv[1:]):
        print(domain, '=>', line, flush=True)
