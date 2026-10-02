#!/usr/bin/env python3
"""El nombre de una via, leido de sus etiquetas de OpenStreetMap y puesto en limpio.

El nombre que se muestra sale de la primera etiqueta que lo trae, en este orden,
y se guarda de cual salio (`nameSource`) para que el tablero no presente como
nombre lo que es un apodo o un nombre viejo. Medido en el extracto del
2026-09-30: `name` esta en el 25 % de las calles `residential`; las demas
etiquetas de nombre suman ~100 vias en todo el pais, asi que el hueco no se
cierra con ellas y no se rellena con inventos.

`ref` no es un nombre: es un codigo. Solo la Red Fundamental y la Departamental
lo usan como ruta (`read_osm_roads.route_of`).
"""

from __future__ import annotations

import re
import unicodedata

# El orden importa: el nombre oficial gana al que usa la gente, y ese al antiguo.
NAME_TAGS = ('name', 'name:es', 'official_name', 'alt_name', 'loc_name', 'old_name')

# Abreviaturas de callejero boliviano -> palabra completa. Solo al inicio del nombre
# o seguidas de punto o barra: «C. Bolivar», «Av. Banzer», «C/ Sucre».
_ABBREVIATIONS = (
    (re.compile(r'^(?:av|avda|ave)\.?\s+', re.IGNORECASE), 'Avenida '),
    (re.compile(r'^(?:c|cl)\s*[./]\s*', re.IGNORECASE), 'Calle '),
    (re.compile(r'^(?:cno|cmno)\.?\s+', re.IGNORECASE), 'Camino '),
    (re.compile(r'^(?:pje|psje)\.?\s+', re.IGNORECASE), 'Pasaje '),
    (re.compile(r'^(?:urb)\.?\s+', re.IGNORECASE), 'Urbanizacion '),
    (re.compile(r'^(?:ctra|crta)\.?\s+', re.IGNORECASE), 'Carretera '),
)

# El tipo de via, para separarlo del nombre propio. Orden: lo mas largo primero.
TYPES = (
    'Avenida', 'Calle', 'Camino', 'Pasaje', 'Carretera', 'Callejon', 'Pasillo', 'Plaza',
    'Paseo', 'Autopista', 'Circunvalacion', 'Ruta', 'Sendero', 'Urbanizacion', 'Boulevard', 'Costanera',
)

# Palabras que en un nombre propio van en minuscula salvo al inicio.
_LOWER = {'de', 'del', 'la', 'las', 'los', 'el', 'y', 'e', 'a', 'en'}
# Siglas y numerales romanos que se conservan en mayuscula.
_KEEP_UPPER = re.compile(r'^(?:[IVXLCDM]{1,5}|[A-Z]{1,3}\d+[A-Z]?|\d+[A-Z]?|RN\d*|FFAA|EE\.?UU\.?|UV|UNIV)$')


def _title(word: str, first: bool) -> str:
    if _KEEP_UPPER.match(word):
        return word
    lowered = word.lower()
    if not first and lowered in _LOWER:
        return lowered
    # «o'higgins»: la letra tras el apostrofo tambien va en mayuscula.
    return re.sub(r"(^|['-])([a-záéíóúñü])", lambda m: m.group(1) + m.group(2).upper(), lowered)


def clean_name(raw: str) -> str:
    """Espacios en limpio, abreviaturas expandidas y TODO EN MAYUSCULAS pasado a titulo."""
    text = re.sub(r'\s+', ' ', raw.replace(' ', ' ')).strip(' \t-–—.,;')
    if not text:
        return ''
    for pattern, full in _ABBREVIATIONS:
        if pattern.match(text):
            text = pattern.sub(full, text, count=1)
            break
    letters = [c for c in text if c.isalpha()]
    # Un nombre escrito todo en mayusculas se pasa a titulo; uno mixto se respeta.
    if letters and all(c.isupper() for c in letters) and len(letters) > 3:
        text = ' '.join(_title(word, index == 0) for index, word in enumerate(text.split(' ')))
    return text


def resolve_name(tags: dict[str, str]) -> tuple[str | None, str | None]:
    """`(nombre, etiqueta)` de la primera etiqueta de nombre que no queda vacia."""
    for tag in NAME_TAGS:
        value = clean_name(tags.get(tag) or '')
        if value:
            return value, tag
    return None, None


def fold(text: str) -> str:
    """Sin tildes ni mayusculas ni signos: la clave con que se busca una calle."""
    base = unicodedata.normalize('NFD', text.lower())
    base = ''.join(c for c in base if unicodedata.category(c) != 'Mn')
    return re.sub(r'[^a-z0-9]+', ' ', base).strip()


def split_type(name: str) -> tuple[str | None, str]:
    """`(tipo, nombre propio)`: «Avenida Blanco Galindo» -> («Avenida», «Blanco Galindo»)."""
    head, _, rest = name.partition(' ')
    for kind in TYPES:
        if fold(head) == fold(kind) and rest:
            return kind, rest
    return None, name
