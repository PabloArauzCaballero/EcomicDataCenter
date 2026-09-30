"""Las adjudicaciones de las subastas del BCB, de sus informes semanales «O&M».

Cada informe trae una sección «ADJUDICACIÓN DE VALORES DE LA SUBASTA DE FECHA dd/mm/aaaa»
con una fila por valor adjudicado: `LB-MN BCB 91 - 24.092 9,1000 8,9000 9,4100`
(valor, emisor, plazo en días, período de protección, cantidad, tasa de rendimiento,
tasa de descuento, tasa efectiva anual). Este módulo lee esas filas y las vuelve series por
valor y plazo: una cifra por subasta.

Solo entra lo que el renglón dice entero. Una fila que no calza con el patrón se cuenta
como «sin leer» y no se adivina, y una fecha de subasta se toma del encabezado de su
propia sección, no de la del informe.
"""
from __future__ import annotations

import re
from dataclasses import dataclass

HEADING = re.compile(
    r'ADJUDICACI[OÓ]N DE VALORES DE LA SUBASTA DE FECHA (\d{1,2})/(\d{1,2})/(\d{4})'
)
ROW = re.compile(
    r'^(?P<valor>[A-Z]{2,3}-[A-Z]{2,3}(?: [\d,]+%)?) (?P<emisor>BCB|TGN) '
    r'(?P<plazo>\d[\d.]*) (?P<proteccion>-|\d+) (?P<cantidad>\d[\d.]*) '
    r'(?P<tr>-?\d+,\d+)(?: (?P<td>-?\d+,\d+|-) (?P<tea>-?\d+,\d+|-))?\s*$'
)
MEASURES = {
    'cantidad': ('Cantidad adjudicada', 'miles de unidades'),
    'tr': ('Tasa de rendimiento', '%'),
    'td': ('Tasa de descuento', '%'),
    'tea': ('Tasa efectiva anual', '%'),
}


@dataclass(frozen=True)
class Award:
    date: str
    valor: str
    emisor: str
    plazo: int
    proteccion: str
    cantidad: str
    tr: str
    td: str | None
    tea: str | None


def decimal(text: str) -> str:
    """«24.092» -> 24092 y «9,1000» -> 9.1: lo que dice el renglón, en decimal."""
    if ',' in text:
        return text.replace('.', '').replace(',', '.')
    return text.replace('.', '')


def parse_awards(text: str) -> tuple[list[Award], int]:
    """Las adjudicaciones de un informe y cuántas filas de la sección no se pudieron leer."""
    awards: list[Award] = []
    unread = 0
    lines = text.splitlines()
    index = 0
    while index < len(lines):
        match = HEADING.search(lines[index])
        index += 1
        if not match:
            continue
        day, month, year = (int(g) for g in match.groups())
        date = f'{year:04d}-{month:02d}-{day:02d}'
        while index < len(lines):
            line = lines[index].strip()
            index += 1
            if re.match(r'^(\d+\)|\d+\. [A-ZÁÉÍÓÚ])', line):
                break  # nota al pie o sección siguiente
            if not line or line.startswith(('Valor ', 'Protecci', 'Periodo')):
                continue
            row = ROW.match(line)
            if not row:
                unread += 1
                continue
            awards.append(
                Award(
                    date, row['valor'], row['emisor'], int(row['plazo'].replace('.', '')),
                    row['proteccion'], decimal(row['cantidad']), decimal(row['tr']),
                    decimal(row['td']) if row['td'] not in (None, '-') else None,
                    decimal(row['tea']) if row['tea'] not in (None, '-') else None,
                )
            )
    return awards, unread


def code_of(valor: str, plazo: int, measure: str) -> str:
    base = re.sub(r'[^A-Z0-9]+', '_', valor.upper()).strip('_')
    return f'BCB_OMA_{base}_{plazo}D_{measure.upper()}'


def build_series(awards: list[Award], url: str, digest: str, at: str) -> list[dict]:
    """Una serie por valor, plazo y medida, con un punto por subasta (la última gana)."""
    grouped: dict[tuple[str, str, int], dict[str, Award]] = {}
    for award in awards:
        grouped.setdefault((award.valor, award.emisor, award.plazo), {})[award.date] = award
    out: list[dict] = []
    for (valor, emisor, plazo), by_date in sorted(grouped.items()):
        for measure, (label, unit) in MEASURES.items():
            points = [
                [date, getattr(award, measure)]
                for date, award in sorted(by_date.items())
                if getattr(award, measure) is not None
            ]
            if len(points) < 2:
                continue
            out.append({
                'indicatorCode': code_of(valor, plazo, measure),
                'name': f'Subasta del {emisor}, {valor} a {plazo} días: {label.lower()}',
                'family': 'operaciones-de-mercado-abierto',
                'workbook': 'omas/informe-semanal',
                'sheet': 'Adjudicación de valores de la subasta',
                'unit': unit,
                'frequency': 'WEEKLY',
                'locator': {'chart': 'Informe semanal O&M', 'page': 1, 'valor': valor, 'plazo': plazo},
                'sourceUrl': url,
                'upstreamSha256': digest,
                'retrievedAt': at,
                'points': points,
            })
    return out
