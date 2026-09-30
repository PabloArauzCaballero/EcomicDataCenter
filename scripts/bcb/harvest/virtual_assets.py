"""Las series de activos virtuales que el BCB publica en gráficos de sus PDF.

    python scripts/bcb/harvest/virtual_assets.py RUTA_DEL_PDF

El BCB no publica estas cifras en ningún cuaderno: están en las etiquetas de dos gráficos
del libro «Historia económica monetaria del bicentenario» (p. 331) y de la Memoria 2024
(cap. 2, p. 25-26). Las cifras se transcriben aquí y el script las COMPRUEBA contra el
texto de la página antes de escribir nada: cada etiqueta tiene que aparecer en el PDF, en
el mismo orden. Una transcripción que no coincide no llega a la semilla.

Es una carga de archivo, no una lectura diaria: el BCB no vuelve a publicar ese gráfico.
Cuando saque una edición nueva se suman los meses aquí.
"""
from __future__ import annotations

import hashlib
import json
import logging
import re
import sys
from pathlib import Path

import pypdf

logging.disable(logging.CRITICAL)

OUT = (
    Path(__file__).resolve().parents[3]
    / 'src' / 'database' / 'seeds' / 'boot' / 'bcb-statistics' / 'activos-virtuales.json'
)
URL = 'https://www.bcb.gob.bo/webdocs/publicacionesbcb/2025/10/09/historia_economica.pdf'
PAGE = 331
WORKBOOK = 'publicacionesbcb/historia_economica'
MONTHS = [f'2024-{m:02d}-01' for m in range(1, 13)] + [f'2025-{m:02d}-01' for m in range(1, 6)]

# Etiquetas de los gráficos, como las imprime el PDF (coma decimal y punto de miles).
AMOUNTS = ['5,7', '7,2', '7,6', '7,3', '9,9', '8,7', '13,7', '17,5', '20,4', '23,7', '28,3',
           '31,7', '35,2', '37,6', '43,8', '48,9', '68,0']
OPERATIONS = ['181', '156', '169', '123', '132', '171', '222', '465', '484', '521', '689',
              '1.342', '1.641', '1.626', '2.342', '2.385', '3.331']
SEMESTER_AMOUNTS = ['46,5', '135,3']
SEMESTER_OPERATIONS = ['932', '3,72']  # «932 mil operaciones» y «3,72 millones de operaciones»


def number(label: str) -> str:
    """«1.342» -> 1342 y «5,7» -> 5.7: lo que dice la etiqueta, en decimal."""
    return label.replace('.', '').replace(',', '.') if ',' in label or '.' in label else label


def verify(text: str, labels: list[str], start: str, end: str) -> None:
    """Cada etiqueta tiene que estar en el texto, en orden, dentro del tramo del gráfico."""
    chunk = text[text.index(start): text.index(end)] if end else text[text.index(start):]
    position = 0
    for label in labels:
        found = chunk.find(label, position)
        if found < 0:
            raise SystemExit(f'la etiqueta {label} no aparece (o no va en ese orden) en el PDF')
        position = found + len(label)


def series(code, name, unit, points, locator, source_url, digest, at):
    return {
        'indicatorCode': code,
        'name': name,
        'family': 'activos-virtuales',
        'workbook': WORKBOOK,
        'sheet': locator['chart'],
        'unit': unit,
        'frequency': 'MONTHLY' if len(points) > 4 else 'SEMIANNUAL',
        'locator': locator,
        'sourceUrl': source_url,
        'upstreamSha256': digest,
        'retrievedAt': at,
        'points': points,
    }


def main() -> int:
    path = Path(sys.argv[1])
    data = path.read_bytes()
    digest = hashlib.sha256(data).hexdigest()
    text = pypdf.PdfReader(str(path)).pages[PAGE - 1].extract_text() or ''
    text = re.sub(r'[ \t]+', ' ', text)
    # La página imprime primero los títulos y después, en este orden, las etiquetas del
    # primer gráfico (hasta la marca «R.D. 082/2024») y las del segundo (hasta la
    # siguiente): se comprueba cada tramo por separado.
    first_mark = text.index('R.D. 082/2024')
    second_mark = text.index('R.D. 082/2024', first_mark + 1)
    verify(text[:first_mark], AMOUNTS, 'Conclusiones', '')
    verify(text[:first_mark], [f'USD {SEMESTER_AMOUNTS[0]}', f'USD {SEMESTER_AMOUNTS[1]}'], 'Conclusiones', '')
    verify(text[first_mark:second_mark], OPERATIONS, 'R.D. 082/2024', '')
    verify(text[first_mark:second_mark], ['932 mil operaciones', '3,72 millones'], 'R.D. 082/2024', '')
    at = '2026-09-30T18:00:00Z'
    note = 'BCB con información de Binance; corresponde a la compra del activo virtual Tether (USDT)'
    amounts = [[m, number(v)] for m, v in zip(MONTHS, AMOUNTS)]
    operations = [[m, number(v)] for m, v in zip(MONTHS, OPERATIONS)]
    rows = [
        series('BCB_ACTIVOS_VIRTUALES_MONTOS_USDT', 'Montos comercializados con USDT en plataforma digital (Binance)',
               'millones de dólares', amounts,
               {'chart': 'Gráfico 41', 'page': PAGE, 'fuente': note,
                'nota': 'Las etiquetas de 2025 suman 233,5 y el gráfico declara 230,7 acumulados para enero-mayo'},
               URL, digest, at),
        series('BCB_ACTIVOS_VIRTUALES_OPERACIONES_USDT', 'Operaciones de compra de USDT en plataforma digital (Binance)',
               'miles de operaciones', operations,
               {'chart': 'Gráfico 42', 'page': PAGE, 'fuente': note}, URL, digest, at),
        series('BCB_ACTIVOS_VIRTUALES_MONTOS_USDT_SEMESTRE', 'Montos con USDT por semestre (declarados por el BCB)',
               'millones de dólares',
               [['2024-01-01', number(SEMESTER_AMOUNTS[0])], ['2024-07-01', number(SEMESTER_AMOUNTS[1])]],
               {'chart': 'Gráfico 41 (acumulados)', 'page': PAGE, 'fuente': note}, URL, digest, at),
        series('BCB_ACTIVOS_VIRTUALES_OPERACIONES_USDT_SEMESTRE', 'Operaciones con USDT por semestre (declaradas por el BCB)',
               'miles de operaciones',
               [['2024-01-01', '932'], ['2024-07-01', '3723']],
               {'chart': 'Gráfico 42 (acumulados)', 'page': PAGE, 'fuente': note}, URL, digest, at),
    ]
    OUT.parent.mkdir(parents=True, exist_ok=True)
    OUT.write_text(
        json.dumps({'family': 'activos-virtuales', 'series': rows}, ensure_ascii=False,
                   separators=(',', ':')) + '\n',
        encoding='utf-8', newline='\n')
    print(f'{len(rows)} series escritas; sha256 {digest[:12]}')
    return 0


if __name__ == '__main__':
    raise SystemExit(main())
