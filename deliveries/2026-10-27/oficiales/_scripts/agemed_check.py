"""AGEMED: baja las 18 hojas de farmacias y compara su sha256 con los guardados en la siembra.

Uso: python -I agemed_check.py <dir_descargas> <dir_siembra_agemed>
"""
import hashlib
import os
import re
import sys

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
from common import fetch  # noqa: E402

BASE = 'https://www.agemed.gob.bo/archivos_vigilancia/farmacias/'
DEPTS = ['la%20paz', 'santa%20cruz']

dl, seed = sys.argv[1], sys.argv[2]
known = set()
for root, _, files in os.walk(seed):
    for f in files:
        with open(os.path.join(root, f), encoding='utf-8', errors='replace') as fh:
            known |= set(re.findall(r'"sha256_xlsx":\s*"([0-9a-f]{64})"', fh.read()))
print('hashes en la siembra:', len(known))
for d in DEPTS:
    for kind in ('urbana', 'rural'):
        name = f'farmacias_{d}_{kind}.xlsx'
        try:
            body = fetch(BASE + name, os.path.join(dl, name), timeout=60, tries=1)
        except Exception as exc:  # noqa: BLE001
            print(name, 'ERR', str(exc)[:60])
            continue
        h = hashlib.sha256(body).hexdigest()
        print(name, len(body), h[:16], 'IGUAL' if h in known else 'NUEVA')
