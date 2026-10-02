"""Pruebas del lector de cuadernos del BCB.  python -m unittest discover scripts/bcb/harvest"""
from __future__ import annotations

import datetime as dt
import sys
import unittest
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))

from harvest import grid, omas, series, shape, sources, versions  # noqa: E402


def sheet(rows):
    info, detail = shape.analyze_sheet('Hoja', 'visible', rows)
    return info, detail


def monthly_rows(values):
    """Una hoja chica: encabezado y una fila por mes de 2020, con dos series."""
    rows = [[None, 'Fecha', 'Reservas', 'Oro'], [None, None, '(En millones de $us)', None]]
    for month, (a, b) in enumerate(values, start=1):
        rows.append([None, dt.datetime(2020, month, 1), a, b])
    return rows


class NumbersAndPeriods(unittest.TestCase):
    def test_reads_the_bolivian_number_format(self):
        self.assertEqual(grid.parse_num('1.234,5'), 1234.5)
        self.assertEqual(grid.parse_num('10,000.25'), 10000.25)
        self.assertIsNone(grid.parse_num('abc'))

    def test_a_year_alone_is_annual_and_a_month_name_needs_its_year(self):
        self.assertEqual(grid.parse_period('2024')[1], 'a')
        self.assertEqual(grid.parse_period('ene-20')[0], dt.date(2020, 1, 1))
        self.assertEqual(grid.parse_period('2020 T2')[0], dt.date(2020, 4, 1))

    def test_plain_decimals_never_use_an_exponent(self):
        self.assertEqual(series.plain(0.00001), '0.00001')
        self.assertEqual(series.plain(1234.5), '1234.5')


class Addresses(unittest.TestCase):
    def test_an_accent_or_a_space_in_the_address_is_encoded_and_a_coded_one_is_left_alone(self):
        raw = 'https://www.bcb.gob.bo/webdocs/OSD/18. Depósitos vista por país.xlsx'
        self.assertEqual(
            sources.encoded(raw),
            'https://www.bcb.gob.bo/webdocs/OSD/18.%20Dep%C3%B3sitos%20vista%20por%20pa%C3%ADs.xlsx',
        )
        coded = 'https://www.bcb.gob.bo/webdocs/Cr%C3%A9ditos%20y%20Dep.xlsx'
        self.assertEqual(sources.encoded(coded), coded)


class Versions(unittest.TestCase):
    base = 'https://www.bcb.gob.bo/webdocs/'

    def test_picks_the_newest_version_of_a_report(self):
        urls = [
            self.base + 'sistema_pagos/Reporte%20Estad%C3%ADstico%20a%20Junio%202026.xlsx',
            self.base + 'sistema_pagos/Reporte%20Estad%C3%ADstico%20a%20Agosto%202026.xlsx',
            self.base + 'sistema_pagos/Reporte%20Estad%C3%ADstico%20a%20Julio%202026.xlsx',
        ]
        chosen = versions.latest_versions(urls)
        self.assertEqual(len(chosen), 1)
        self.assertIn('Agosto', next(iter(chosen.values())))

    def test_a_table_known_only_by_its_number_is_its_own_report(self):
        base = self.base + 'publicacionesbcb/'
        forty_five, forty_six = base + '2026/02/27/45.xlsx', base + '2026/02/27/46.xlsx'
        self.assertEqual(len(versions.latest_versions([forty_five, forty_six])), 2)
        # la misma tabla en dos entregas sigue siendo una, y gana la más nueva
        older = base + '2025/12/31/45.xlsx'
        self.assertEqual(list(versions.latest_versions([older, forty_five]).values()), [forty_five])

    def test_reads_a_full_date_in_the_name(self):
        urls = [
            self.base + 'tasas_interes/TD_31%2008%202026.xlsx',
            self.base + 'tasas_interes/TD_24%2009%202026.xlsx',
        ]
        self.assertIn('24', next(iter(versions.latest_versions(urls).values())))


class Extraction(unittest.TestCase):
    def test_series_in_columns_keep_their_unit_and_their_cells(self):
        info, detail = sheet(monthly_rows([(10, 1), (11, 2), (12, 3), (13, 4)]))
        found = series.extract(info, detail)
        self.assertEqual(len(found), 2)
        self.assertEqual(found[0].points[0], ('2020-01-01', '10'))
        self.assertEqual(found[0].locator['orientation'], 'columns')

    def test_a_returning_date_drops_the_series_instead_of_publishing_it(self):
        graded = [('2000-10-01', '1', 'm'), ('2000-11-01', '2', 'm'), ('2000-01-01', '3', 'm')]
        self.assertEqual(series._coherent(graded), [])

    def test_an_annual_point_inside_a_monthly_series_is_dropped(self):
        graded = [
            ('2000-01-01', '1', 'm'),
            ('2000-02-01', '2', 'm'),
            ('2000-03-01', '3', 'm'),
            ('2000-01-01', '9', 'a'),
        ]
        self.assertEqual(series._coherent(graded), [p[:2] for p in graded[:3]])

    def test_two_columns_with_one_name_stay_two_series(self):
        seen: set[str] = set()
        first = series._unique('Total', 2, seen)
        second = series._unique('Total', 3, seen)
        self.assertNotEqual(first, second)


class Auctions(unittest.TestCase):
    report = '''A. SUBASTA
1. ADJUDICACIÓN DE VALORES DE LA SUBASTA DE FECHA 23/09/2026
Valor Emisor Plazo 1) Periodo de
Protección 2) Cantidad 3) TR (%) TD (%) TEA (%)
LB-MN BCB 91 - 24.092 9,1000 8,9000 9,4100
BT-MN 10,45% TGN 364 - 300.000 10,4500 - -
3) Cada título tiene un valor nominal de 1.000 unidades en moneda origen.
'''

    def test_reads_a_row_and_takes_the_date_from_its_own_heading(self):
        awards, unread = omas.parse_awards(self.report)
        self.assertEqual(unread, 0)
        bill = awards[0]
        self.assertEqual((bill.date, bill.valor, bill.plazo), ('2026-09-23', 'LB-MN', 91))
        self.assertEqual((bill.cantidad, bill.tr, bill.td, bill.tea), ('24092', '9.1000', '8.9000', '9.4100'))

    def test_a_bond_has_no_discount_rate_and_that_is_no_value_not_zero(self):
        bond = omas.parse_awards(self.report)[0][1]
        self.assertIsNone(bond.td)
        self.assertIsNone(bond.tea)

    def test_a_row_it_cannot_read_is_counted_and_not_guessed(self):
        awards, unread = omas.parse_awards(self.report.replace('24.092 9,1000', '???'))
        self.assertEqual(unread, 1)
        self.assertEqual(len(awards), 1)


if __name__ == '__main__':
    unittest.main()
