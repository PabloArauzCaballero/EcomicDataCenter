"""Pruebas de los cuadros de día × mes y de los resultados de subasta del BCB."""
from __future__ import annotations

import datetime as dt
import sys
import unittest
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))

from harvest import matrix, omas  # noqa: E402


class DayByMonth(unittest.TestCase):
    """Cuadros de día × mes: el tipo de cambio oficial y la UFV diaria."""

    @staticmethod
    def table(two_values=False):
        months = ['ENE', 'FEB', 'MAR', 'ABR', 'MAY', 'JUN']
        step = 2 if two_values else 1
        head = [None] * (1 + step * len(months))
        year_row, month_row, label_row = list(head), list(head), list(head)
        year_row[1] = 2024
        for i, name in enumerate(months):
            month_row[1 + i * step] = name
            if two_values:
                label_row[1 + i * step], label_row[2 + i * step] = 'Compra', 'Venta'
        rows = [['COTIZACIONES'], ['(En bolivianos por $us)'], year_row, month_row]
        if two_values:
            rows.append(label_row)
        for day in range(1, 32):
            row = [day]
            for month in range(6):
                for k in range(step):
                    row.append(None if (month == 1 and day > 29) else 6.86 + k * 0.1 + day / 1000)
            rows.append(row)
        return rows

    def test_every_filled_cell_is_one_exact_date(self):
        found = matrix.read(self.table(), 'Hoja', '')
        self.assertEqual(len(found), 1)
        points = dict(found[0].points)
        self.assertEqual(found[0].frequency, 'DAILY')
        self.assertEqual(points['2024-01-31'], '6.891')
        self.assertIn('2024-02-29', points)  # 2024 es bisiesto
        self.assertNotIn('2024-02-30', points)

    def test_a_day_that_does_not_exist_is_never_made_up(self):
        points = dict(matrix.read(self.table(), 'Hoja', '')[0].points)
        self.assertNotIn('2024-04-31', points)  # abril no tiene 31 días aunque la celda esté llena

    def test_two_values_per_month_make_two_series(self):
        found = matrix.read(self.table(two_values=True), 'Hoja', '')
        self.assertEqual(sorted(s.name.rsplit(' · ', 1)[-1] for s in found), ['Compra', 'Venta'])
        compra, venta = (dict(s.points) for s in sorted(found, key=lambda s: s.name))
        self.assertEqual(compra['2024-03-05'], '6.865')
        self.assertEqual(venta['2024-03-05'], '6.965')

    def test_a_sheet_without_that_shape_is_left_to_the_other_readers(self):
        self.assertEqual(matrix.read([['Mes', 'Valor'], ['ene', 1], ['feb', 2]], 'Hoja', ''), [])


class AuctionResults(unittest.TestCase):
    """El resultado de cada subasta, leído en modo «layout»."""

    bills = """
        RESULTADOS DE SUBASTA LETRAS RESCATABLES BCB 17 / 2026
                                         BCB
        BOLIVIANOS

Cantidad Ofertada:               300.000    Plazo:       182  días       / 6 meses
Serie:    LRNR00262617

                       5.200     BCB           9,0998       8,7000       9,3000           5.200
                      83.700     BCB           9,1500       8,7500       9,3600          83.700
                      20.000     BCB           9,2000       8,7900       9,4100                0       DPM

         1)          219.367                    9,1486       8,7400       9,3600        188.900

Cantidad Ofertada:               200.000    Plazo:       273  días       / 9 meses
Serie:    LRNR00392617

                       5.000     BCB          10,5000      9,7300      10,6300                0       DPM

         1)            5.000                    0,0000

SEOMA-reporteResultadoSubasta Fecha:22/04/2026 15:26:01
"""

    bonds = """
        RESULTADOS DE SUBASTA BONOS TGN 34 / 2026
                                         TGN
BOLIVIANOS
Cantidad Ofertada:              300.000    Plazo:       364  días      / 1 años
Serie:    BTNC00522634        TRN:    10,45 %
                       50.000     TGN          10,4500                                   50.000
         1)           107.000                  10,4500                                   81.000
SEOMA-reporteResultadoSubasta Fecha:19/08/2026 14:09:54
"""

    def test_reads_the_average_of_a_series_with_its_own_date_and_a_year_in_the_title(self):
        awards, unread = omas.parse_results(self.bills)
        self.assertEqual(unread, 0)
        self.assertEqual(len(awards), 1)  # la segunda serie no adjudicó nada
        bill = awards[0]
        self.assertEqual((bill.date, bill.valor, bill.emisor, bill.plazo), ('2026-04-22', 'LR-MN', 'BCB', 182))
        self.assertEqual((bill.cantidad, bill.tr, bill.td, bill.tea), ('188900', '9.1486', '8.7400', '9.3600'))

    def test_a_bond_has_no_discount_rate_and_takes_its_issuer_from_the_bids(self):
        bond = omas.parse_results(self.bonds)[0][0]
        self.assertEqual((bond.valor, bond.emisor, bond.plazo, bond.cantidad, bond.tr), ('BT-MN', 'TGN', 364, '81000', '10.4500'))
        self.assertIsNone(bond.td)

    def test_a_series_whose_average_line_cannot_be_split_is_counted_and_not_guessed(self):
        broken = self.bills.replace('219.367                    9,1486       8,7400', '219.3679,1486  8,7400x')
        awards, unread = omas.parse_results(broken)
        self.assertEqual((len(awards), unread), (0, 1))

    def test_reports_before_the_current_format_are_left_alone(self):
        self.assertEqual(omas.parse_results(self.bonds.replace('/2026', '/2013').replace('19/08/2026', '19/08/2013')), ([], 0))


if __name__ == '__main__':
    unittest.main()
