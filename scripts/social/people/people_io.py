"""Carga el padrón: las 300 fichas de descubrimiento más las altas manuales de padron-additions.json."""
import json
from pathlib import Path

HERE = Path(__file__).parent


def load_people():
    people = json.loads((HERE / 'research-300.json').read_text(encoding='utf8'))['people']
    known = {p['slug'] for p in people}
    extra = json.loads((HERE / 'padron-additions.json').read_text(encoding='utf8'))
    return people + [p for p in extra if p['slug'] not in known]
