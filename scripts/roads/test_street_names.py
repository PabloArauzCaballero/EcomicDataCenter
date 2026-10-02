#!/usr/bin/env python3
"""Pruebas de `street_names`: `python scripts/roads/test_street_names.py`."""

from street_names import clean_name, fold, resolve_name, split_type

CASES = [
    ('  Avenida   Panamericana ', 'Avenida Panamericana'),
    ('Av. Banzer', 'Avenida Banzer'),
    ('C/ Sucre', 'Calle Sucre'),
    ('C. Bolivar', 'Calle Bolivar'),
    ('Cno. a Cotoca', 'Camino a Cotoca'),
    ('Pje. Los Pinos', 'Pasaje Los Pinos'),
    ('AVENIDA BLANCO GALINDO', 'Avenida Blanco Galindo'),
    ('CALLE 6 DE AGOSTO', 'Calle 6 de Agosto'),
    ('AVENIDA DEL EJERCITO', 'Avenida del Ejercito'),
    ('Calle O\'Higgins', "Calle O'Higgins"),
    ('Avenida Circunvalación', 'Avenida Circunvalación'),
    ('Calle 21', 'Calle 21'),
    ('RN10: Guabirá-Colonia Pirai', 'RN10: Guabirá-Colonia Pirai'),
    ('   ', ''),
]


def main() -> None:
    for raw, expected in CASES:
        got = clean_name(raw)
        assert got == expected, f'{raw!r}: esperaba {expected!r} y salio {got!r}'

    # El orden de las etiquetas: name gana, luego name:es, y asi.
    assert resolve_name({'name': 'Calle A', 'alt_name': 'Calle B'}) == ('Calle A', 'name')
    assert resolve_name({'alt_name': 'Calle B', 'old_name': 'Calle C'}) == ('Calle B', 'alt_name')
    assert resolve_name({'name': '  ', 'loc_name': 'El Camino'}) == ('El Camino', 'loc_name')
    # Un `ref` no es un nombre.
    assert resolve_name({'ref': 'D4105'}) == (None, None)
    assert resolve_name({}) == (None, None)

    assert fold('Avenida Circunvalación') == 'avenida circunvalacion'
    assert fold('  Calle  6 DE Agosto ') == 'calle 6 de agosto'
    assert split_type('Avenida Blanco Galindo') == ('Avenida', 'Blanco Galindo')
    assert split_type('Circunvalación') == (None, 'Circunvalación')
    assert split_type('Avenida') == (None, 'Avenida')
    print('street_names: ok')


if __name__ == '__main__':
    main()
