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
                'workbook': 'omas/informes-de-subasta',
                'sheet': 'Adjudicación de valores de la subasta',
                'unit': unit,
                'frequency': 'WEEKLY',
                'locator': {'chart': 'Informe de subasta (O&M semanal o resultado)', 'page': 1, 'valor': valor, 'plazo': plazo},
                'sourceUrl': url,
                'upstreamSha256': digest,
                'retrievedAt': at,
                'points': points,
            })
    return out


# ---------------------------------------------------------------------------------------
# Resultados de cada subasta: un PDF por subasta («RESULTADOS DE SUBASTA LETRAS … 17 / 2026»)
# ---------------------------------------------------------------------------------------

RESULT_TITLE = re.compile(
    r'RESULTADOS?\s+DE\s+SUBASTA\s+(?P<tipo>.+?)\s+(?P<number>\d+)\s*/\s*(?P<year>\d{4})(?P<rest>.*)'
)
STAMP = re.compile(r'Fecha:\s*(\d{1,2})/(\d{1,2})/(\d{4})')
ANY_DATE = re.compile(r'\b(\d{1,2})/(\d{1,2})/(\d{4})\b')
OFFER = re.compile(
    r'(?:Cantidad|Monto)\s+Ofertad[oa]:\s*[\d.]+\s+Plazo:\s*(?:d[ií]as\s*)?(?P<days>\d[\d.]*)'
)
BID_ISSUER = re.compile(r'^\s*\*?\s*\d[\d.]*\s+(?P<emisor>BCB|TGN)\s+-?\d+,\d+')
NUMBER = re.compile(r'^-?\d[\d.]*(?:,\d+)?$')
KIND_CODES = (
    ('LETRAS RESCATABLES', 'LR'),
    ('BONOS RESCATABLES', 'BR'),
    ('LETRAS DEL TESORO', 'LT'),
    ('LETRAS', 'LB'),
    ('BONOS TGN', 'BT'),
    ('BONOS DEL TGN', 'BT'),
    ('BONOS BCB', 'BB'),
    ('BONOS DEL BCB', 'BB'),
)
FIRST_ERA = 2022  # antes de esa fecha los informes tienen otro formato y no se leen


def _currency(line: str) -> str | None:
    text = line.strip().upper()
    if text.startswith('MONEDA NACIONAL INDEXADA') or text.startswith('UNIDAD DE FOMENTO'):
        return 'UFV'
    if text.startswith(('BOLIVIANOS', 'MONEDA NACIONAL')):
        return 'MN'
    if 'LARES AMERICANOS' in text or text.startswith('MONEDA EXTRANJERA'):
        return 'ME'
    return None


def _total_numbers(line: str) -> list[str] | None:
    """Los números de la línea de promedio («1) 219.367 9,1486 8,7400 9,3600 188.900»)."""
    body = line.strip()
    if body.startswith('1)'):
        body = body[2:]
    elif body.startswith('*'):
        body = body[1:]
    else:
        return None
    tokens = [t for t in body.replace('%', ' ').split() if t]
    return tokens if tokens and all(NUMBER.match(t) for t in tokens) else None


def parse_results(text: str) -> tuple[list[Award], int]:
    """La adjudicación de cada serie de un informe de resultado de subasta, y cuántas series no se leyeron.

    El texto viene en modo «layout», que conserva las columnas: sin él, el monto adjudicado y la
    tasa que le sigue quedan pegados (`5.2008,7000`) y no se sabe dónde parte uno del otro.
    Una serie sin línea de promedio —desierta— o sin nada adjudicado no es una adjudicación, y
    una línea de promedio que no calza con ninguna de las dos formas conocidas se cuenta como
    «sin leer» en vez de adivinarse.
    """
    lines = text.splitlines()
    title = next((m for m in map(RESULT_TITLE.search, lines) if m), None)
    if not title:
        return [], 0
    stamp = STAMP.search(text) or ANY_DATE.search(title['rest'])
    if not stamp:
        return [], 0
    day, month, year = (int(g) for g in stamp.groups())
    if year < FIRST_ERA:
        return [], 0
    date = f'{year:04d}-{month:02d}-{day:02d}'
    heading = title['tipo'].upper()
    default_issuer = 'TGN' if 'TGN' in heading else 'BCB'
    awards: list[Award] = []
    unread = 0
    currency = None
    block: dict | None = None

    def close() -> None:
        nonlocal block, unread
        if block is None:
            return
        done, block = block, None
        kind = next((code for name, code in KIND_CODES if heading.startswith(name)), None)
        if not kind or not currency:
            unread += 1
            return
        numbers = done['total']
        if done['broken']:
            unread += 1  # la línea de promedio está ahí pero sus columnas se pisan
            return
        if numbers is None:
            return  # sin línea de promedio: subasta desierta
        has_award = len(numbers) > 1 and ',' not in numbers[-1] and decimal(numbers[-1]) != '0'
        if not has_award:
            return  # nada adjudicado (solo la demanda): no hay tasa de adjudicación
        if len(numbers) == 5:  # letras: demandada, TR, TD, TEA, adjudicada
            _, tr, td, tea, awarded = numbers
        elif len(numbers) == 3:  # bonos: demandada, TR, adjudicada
            _, tr, awarded = numbers
            td = tea = None
        else:
            unread += 1
            return
        awards.append(
            Award(
                date, f'{kind}-{currency}', done['emisor'] or default_issuer, done['days'], '-',
                decimal(awarded), decimal(tr), decimal(td) if td else None, decimal(tea) if tea else None,
            )
        )

    for raw in lines:
        found = _currency(raw)
        if found:
            currency = found
        offer = OFFER.search(raw)
        if offer:
            close()
            block = {'days': int(offer['days'].replace('.', '')), 'emisor': None, 'total': None, 'broken': False}
            continue
        if block is None:
            continue
        bid = BID_ISSUER.match(raw)
        if bid and not block['emisor']:
            block['emisor'] = bid['emisor']
        numbers = _total_numbers(raw)
        if numbers is not None:
            block['total'] = numbers
        elif re.match(r'^\s*1\)\s+-?\d', raw):
            block['broken'] = True
    close()
    return awards, unread
