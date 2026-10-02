"""Pruebas de los cuadros por entidad y por período (tasas del BCB).  python -m unittest discover scripts/bcb/harvest"""
from __future__ import annotations

import datetime as dt
import sys
import unittest
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))

from harvest import blocks, cuts, feeds  # noqa: E402


class RateCuts(unittest.TestCase):
    """Los cuadros diarios y semanales de tasas por entidad."""

    @staticmethod
    def active(day='24 de septiembre de 2026', label=0, banks=None):
        pad = [None] * label
        banks = banks if banks is not None else [
            ('CRÉDITO DE BOLIVIA', 11.5, 9.4),
            ('GANADERO', 0, 42.5),
        ]
        rows = [
            [*pad, 'BANCO CENTRAL DE BOLIVIA'],
            [*pad, day],
            [],
            [*pad, 'Entidades', 'Moneda Nacional', None, 'Moneda extranjera', 'UFV'],
            [*pad, None, 'Empresarial', 'Micro-crédito', 'Consumo', 'Promedio'],
            [],
            [*pad, 'BANCOS MÚLTIPLES'],
        ]
        for name, first, second in banks:
            rows.append([*pad, name, first, second, 0, 0])
        rows.append([*pad, '(1) Vigente desde el 03/03/2023'])
        return rows

    def test_a_daily_and_a_weekly_cut_say_their_date(self):
        daily = cuts.cut_date(self.active())
        self.assertEqual(daily, (dt.date(2026, 9, 24), 'DAILY'))
        weekly = cuts.cut_date(self.active('Semana del 31de marzo al 6 de abril de 2025  (En porcentajes)'))
        self.assertEqual(weekly, (dt.date(2025, 4, 6), 'WEEKLY'))

    def test_a_zero_is_no_operations_and_is_not_a_rate(self):
        found = cuts.read_cut(self.active())
        self.assertIn(('CREDITO DE BOLIVIA', 'Moneda nacional | Empresarial', 11.5), found)
        self.assertFalse([f for f in found if f[0] == 'GANADERO' and f[1].endswith('Empresarial')])
        self.assertTrue(all(rate != 0 for _, _, rate in found))

    def test_the_label_column_can_sit_anywhere_and_footnotes_are_not_entities(self):
        shifted = cuts.read_cut(self.active(label=1))
        self.assertEqual(shifted, cuts.read_cut(self.active()))
        self.assertFalse([f for f in shifted if f[0].startswith('(')])

    def test_spelling_variants_are_one_entity_and_one_column(self):
        self.assertEqual(cuts.entity_name('Mercantil SCZ'), 'MERCANTIL SANTA CRUZ')
        self.assertEqual(cuts.entity_name('CRÉDITO DE BOLIVIA'), 'CREDITO DE BOLIVIA')
        self.assertEqual(cuts._label('Micro-crédito'), cuts._label('Microcrédito'))
        self.assertEqual(cuts._label('MONEDA NACIONAL'), 'Moneda nacional')

    def test_a_mistyped_term_takes_the_only_term_that_fits_between_its_neighbours(self):
        head = ['Moneda extranjera', 'Depósito a plazo fijo']
        fixed = cuts.repair_terms({3: [*head, '30 días'], 4: [*head, 'qq'], 5: [*head, '90 días']})
        self.assertEqual(fixed[4][-1], '60 días')
        # Entre 90 y 720 caben dos plazos (180 y 360): no se adivina cuál es.
        unclear = cuts.repair_terms({3: [*head, '90 días'], 4: [*head, 'qq'], 5: [*head, '720 días']})
        self.assertNotIn(4, unclear)

    def test_a_newer_cut_with_the_same_date_wins_and_series_need_two_points(self):
        old = ('v1', {'ACT': self.active()})
        new = ('v2', {'ACT': self.active(banks=[('CRÉDITO DE BOLIVIA', 12.0, 9.4)])})
        later = ('v3', {'ACT': self.active('25 de septiembre de 2026', banks=[('CRÉDITO DE BOLIVIA', 11.5, 9.4)])})
        merged = cuts.collect([old, new, later])
        key = ('ACT', 'DAILY', 'CREDITO DE BOLIVIA', 'Moneda nacional | Empresarial')
        self.assertEqual(merged[key], {'2026-09-24': 12.0, '2026-09-25': 11.5})
        records, single = feeds.records_of(cuts.FEED, merged, {'v1': 'a'}, '2026-09-25T00:00:00Z')
        self.assertTrue(all(len(r['points']) >= 2 for r in records))
        self.assertTrue(single)  # lo que tiene un solo punto espera el siguiente cuadro
        again = feeds.accumulated(cuts.FEED, records, single)
        self.assertEqual(again[key], merged[key])


class PeriodBlocks(unittest.TestCase):
    """Tasas históricas por tipo de entidad: un bloque por período."""

    @staticmethod
    def sheet(periods):
        rows = [
            ['TASAS DE INTERES ACTIVAS POR DESTINO DEL CREDITO', None, None, None, None],
            ['Detalle Año - Mes'],
            ['Tipo Transacción', '(Varios elementos)'],
            [None, 'Destinos'],
            [None, 'MONEDA NACIONAL', None, 'MONEDA EXTRANJERA', None],
            [None, 'CONSUMO', None, 'CONSUMO', None],
            ['Entidades', 'Nomin', 'Efect', 'Nomin', 'Efect'],
            ['2013'],
        ]
        for label, total, banks in periods:
            rows.append([label, *total])
            rows.extend([name, *values] for name, values in banks)
        rows.append(['Fuente: Gerencia de Entidades Financieras'])
        return rows

    def test_the_labels_of_a_period_say_their_date_and_frequency(self):
        self.assertEqual(blocks.period_of('SEM del 29/12/2025'), (dt.date(2025, 12, 29), 'WEEKLY'))
        self.assertEqual(blocks.period_of('Ene 2010'), (dt.date(2010, 1, 1), 'MONTHLY'))
        self.assertEqual(blocks.period_of('Abr-2017'), (dt.date(2017, 4, 1), 'MONTHLY'))
        self.assertEqual(blocks.period_of('2001 SEGUNDO SEMESTRE'), (dt.date(2001, 7, 1), 'SEMIANNUAL'))
        self.assertEqual(blocks.period_of('2013'), (dt.date(2013, 1, 1), 'ANNUAL'))
        self.assertIsNone(blocks.period_of('BANCOS'))

    def test_a_month_row_with_figures_is_the_total_of_all_entities(self):
        rows = self.sheet(
            [
                ('Ene 2013', [15.5, 17.1, 6.1, 6.2], [('BANCOS', [15.2, 16.8, 6.0, 6.1])]),
                ('Feb 2013', [15.6, 17.2, 5.7, 5.8], [('BANCOS', [15.4, 17.0, 0, 0])]),
            ]
        )
        found = blocks.read_sheet(rows)
        by = {(e, c, d): r for _, e, c, d, _, r in found}
        total = ('TODAS LAS ENTIDADES', 'Moneda nacional | Consumo | Nominal', '2013-01-01')
        self.assertEqual(by[total], 15.5)
        self.assertEqual(by[('BANCOS', 'Moneda extranjera | Consumo | Efectiva', '2013-01-01')], 6.1)
        # el cero es «sin operaciones»: no hay punto de febrero para la moneda extranjera
        self.assertNotIn(('BANCOS', 'Moneda extranjera | Consumo | Nominal', '2013-02-01'), by)

    def test_the_credit_line_and_the_footnote_are_never_headers_or_entities(self):
        rows = self.sheet([('Ene 2013', [1, 2, 3, 4], [('BANCOS', [1, 2, 3, 4])])])
        rows[0][3] = 'Gerencia de Entidades Financieras'
        found = blocks.read_sheet(rows)
        self.assertTrue(all('Gerencia' not in c and not e.startswith('FUENTE') for _, e, c, *_ in found))
        self.assertEqual({k for _, _, c, *_ in found for k in c.split(' | ')} - {'Moneda nacional', 'Moneda extranjera', 'Consumo', 'Nominal', 'Efectiva'}, set())

    def test_files_of_many_years_join_into_one_series(self):
        one = ('a', {'H': self.sheet([('Ene 2013', [1, 2, 3, 4], [('BANCOS', [5, 6, 7, 8])])])})
        two = ('b', {'H': self.sheet([('Ene 2014', [1, 2, 3, 4], [('BANCOS', [9, 6, 7, 8])])])})
        merged = blocks.collect([one, two])
        key = ('ACT', 'MONTHLY', 'BANCOS', 'Moneda nacional | Consumo | Nominal')
        self.assertEqual(merged[key], {'2013-01-01': 5.0, '2014-01-01': 9.0})


if __name__ == '__main__':
    unittest.main()
