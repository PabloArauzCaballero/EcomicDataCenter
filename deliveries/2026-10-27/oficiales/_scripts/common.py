"""Piezas comunes de los recolectores de registros oficiales (entrega 2026-10-27).

Cada recolector produce filas con los campos normalizados que comparten los
doce agentes y las escribe en NDJSON comprimido con gzip, de forma determinista
(mtime 0) para que el sha256 del manifest no cambie si los datos no cambian.
"""

import gzip
import hashlib
import json
import os
import re
import ssl
import time
import urllib.request
from datetime import datetime, timezone

FIELDS = [
    'source', 'source_id', 'name', 'category_raw', 'address', 'locality',
    'municipality', 'department', 'lat', 'lon', 'phone', 'website', 'hours',
    'source_updated_at', 'source_url', 'retrieved_at', 'raw',
]

UA = ('Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 '
      '(KHTML, like Gecko) Chrome/130.0 Safari/537.36 DatosBolivia-recoleccion')

DEPARTMENTS = {
    'LA PAZ': 'La Paz', 'SANTA CRUZ': 'Santa Cruz', 'COCHABAMBA': 'Cochabamba',
    'ORURO': 'Oruro', 'POTOSI': 'Potosí', 'POTOSÍ': 'Potosí',
    'CHUQUISACA': 'Chuquisaca', 'TARIJA': 'Tarija', 'BENI': 'Beni',
    'PANDO': 'Pando',
}


def now_iso():
    return datetime.now(timezone.utc).replace(microsecond=0).isoformat().replace('+00:00', 'Z')


def fetch(url, dest=None, data=None, headers=None, timeout=120, tries=3):
    """GET (o POST si hay data) con verificacion TLS normal. Devuelve bytes."""
    last = None
    for attempt in range(tries):
        try:
            req = urllib.request.Request(url, data=data, headers={'User-Agent': UA, **(headers or {})})
            with urllib.request.urlopen(req, timeout=timeout, context=ssl.create_default_context()) as resp:
                body = resp.read()
            if dest:
                os.makedirs(os.path.dirname(dest), exist_ok=True)
                with open(dest, 'wb') as fh:
                    fh.write(body)
            return body
        except Exception as exc:  # noqa: BLE001
            last = exc
            time.sleep(2 * (attempt + 1))
    raise last


def decode(body):
    try:
        return body.decode('utf-8')
    except UnicodeDecodeError:
        return body.decode('latin-1')


def clean(text, longest=500):
    if text is None:
        return None
    text = re.sub(r'<br\s*/?>', ' ', str(text), flags=re.I)
    text = re.sub(r'<[^>]+>', '', text)
    text = (text.replace('&nbsp;', ' ').replace('&quot;', '"').replace('&amp;', '&')
            .replace('&#39;', "'").replace('&lt;', '<').replace('&gt;', '>'))
    text = re.sub(r'\s+', ' ', text).strip()
    return text[:longest] if text else None


def in_bolivia(lat, lon):
    try:
        lat = float(lat)
        lon = float(lon)
    except (TypeError, ValueError):
        return False
    return -23.0 <= lat <= -9.5 and -69.8 <= lon <= -57.3


def coords(lat, lon):
    """(lat, lon) como float si caen en Bolivia; si no, (None, None)."""
    if in_bolivia(lat, lon):
        return round(float(lat), 7), round(float(lon), 7)
    return None, None


def department(text):
    if not text:
        return None
    key = clean(text).upper().replace('Í', 'I')
    for k, v in DEPARTMENTS.items():
        if k.replace('Í', 'I') == key:
            return v
    return clean(text).title()


def record(**kw):
    unknown = set(kw) - set(FIELDS)
    if unknown:
        raise KeyError(unknown)
    return {f: kw.get(f) for f in FIELDS}


def write_source(out_dir, source, rows):
    """Escribe <out_dir>/<source>.ndjson.gz y devuelve estadisticas."""
    os.makedirs(out_dir, exist_ok=True)
    path = os.path.join(out_dir, f'{source}.ndjson.gz')
    payload = ''.join(json.dumps(r, ensure_ascii=False, sort_keys=False) + '\n' for r in rows).encode('utf-8')
    with open(path, 'wb') as raw:
        with gzip.GzipFile(filename='', mode='wb', fileobj=raw, mtime=0) as gz:
            gz.write(payload)
    with open(path, 'rb') as fh:
        digest = hashlib.sha256(fh.read()).hexdigest()
    with_coords = sum(1 for r in rows if r.get('lat') is not None and r.get('lon') is not None)
    with_address = sum(1 for r in rows if r.get('address'))
    return {
        'file': os.path.basename(path),
        'rows': len(rows),
        'with_coords': with_coords,
        'pct_coords': round(100 * with_coords / len(rows), 1) if rows else 0.0,
        'with_address': with_address,
        'sha256': digest,
        'bytes': os.path.getsize(path),
    }


def sha256_bytes(body):
    return hashlib.sha256(body).hexdigest()
