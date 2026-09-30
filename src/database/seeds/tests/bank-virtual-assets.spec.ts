import { readFile } from 'node:fs/promises';
import { join } from 'node:path';
import { bankVirtualAssetsSchema } from '../schemas/bank-virtual-assets.schema';
import {
  decodePage,
  laPazDate,
  mergeSeed,
  plainAmount,
  readPage,
  visibleText,
} from '../../../../scripts/banks/bank-readings';
import { PAGES } from '../../../../scripts/banks/bank-sources';

/**
 * Guards the virtual-dollar services of the banks.
 *
 * No bank publishes a price, so the series are «does the official page still
 * announce the service» and «which limits does it declare». Both fail in
 * silence somewhere else: a page that errors would read as a withdrawn
 * service, a limit written «10,000» would read as ten, and a second run on the
 * same day would rewrite the seed and redeploy the whole application for
 * nothing.
 */
describe('bank virtual-asset snapshots', () => {
  const load = async () =>
    bankVirtualAssetsSchema.parse(
      JSON.parse(await readFile(join(__dirname, '..', 'boot', 'bank-virtual-assets.json'), 'utf8')),
    );

  it('starts every service series at a dated announcement', async () => {
    const seed = await load();
    for (const series of seed.series.filter((one) => one.kind === 'OFFERED')) {
      expect(series.points[0]?.basis).not.toBe('OFFICIAL_PAGE');
    }
  });

  it('never reuses a code and keeps the days ascending and unique', async () => {
    const seed = await load();
    const codes = seed.series.map((one) => one.indicatorCode);
    expect(new Set(codes).size).toBe(codes.length);
    for (const series of seed.series) {
      const days = series.points.map((point) => point.date);
      expect(days).toEqual([...days].sort());
    }
  });

  it('is stored in the key order the schema writes', async () => {
    // The collector writes what the schema returns; a seed in any other order
    // would be rewritten by the next run without one figure changing, and every
    // rewrite is a deploy.
    const raw = JSON.parse(
      await readFile(join(__dirname, '..', 'boot', 'bank-virtual-assets.json'), 'utf8'),
    ) as unknown;
    expect(JSON.stringify(bankVirtualAssetsSchema.parse(raw))).toBe(JSON.stringify(raw));
  });

  it('names every bank the pages read in a series of its own', async () => {
    const seed = await load();
    const banks = new Set(seed.series.map((one) => one.bank));
    for (const page of PAGES) expect(banks.has(page.bank)).toBe(true);
  });
});

describe('reading a bank page', () => {
  const now = new Date('2026-09-30T15:00:00Z');
  const ganadero = PAGES.find((page) => page.bank === 'GANADERO');
  const pageWith = (body: string) =>
    Buffer.from(`<html><body>Banco Ganadero ${body} ${'relleno '.repeat(700)}</body></html>`);
  const announcing =
    'GanaCripto te permite comprar, vender y custodiar USDC. Compra/Venta: De 100 USDC a 10,000 USDC por día. Giros Internacionales: De 200 USDC a 10,000 USDC por día.';

  it('reads a limit written with a thousands comma as ten thousand, not ten', () => {
    expect(plainAmount('10,000')).toBe('10000');
    expect(plainAmount('10.000')).toBe('10000');
    expect(plainAmount('2,5')).toBe('2.5');
    expect(plainAmount('100')).toBe('100');
  });

  it('reads the service and its four limits', () => {
    if (!ganadero) throw new Error('falta la página de Ganadero');
    const readings = readPage(ganadero, pageWith(announcing), '2026-09-30', now);
    const byCode = new Map(readings.map((one) => [one.indicatorCode, one.point.value]));
    expect(byCode.get('VASP_GANADERO_USDC_OFFERED')).toBe('1');
    expect(byCode.get('VASP_GANADERO_USDC_TRADE_MIN')).toBe('100');
    expect(byCode.get('VASP_GANADERO_USDC_TRADE_MAX_DAY')).toBe('10000');
    expect(byCode.get('VASP_GANADERO_USDC_TRANSFER_MIN')).toBe('200');
  });

  it('writes a zero only when the page answers and no longer names the service', () => {
    if (!ganadero) throw new Error('falta la página de Ganadero');
    const readings = readPage(ganadero, pageWith('Página de inicio.'), '2026-09-30', now);
    expect(readings).toHaveLength(1);
    expect(readings[0]?.point.value).toBe('0');
  });

  it('refuses an error page instead of reading it as a withdrawn service', () => {
    if (!ganadero) throw new Error('falta la página de Ganadero');
    expect(() =>
      readPage(ganadero, Buffer.from('<html>502 Bad Gateway</html>'), '2026-09-30', now),
    ).toThrow(/no es la página del banco/u);
    const stranger = Buffer.from(`<html>otra cosa ${'x '.repeat(3000)}</html>`);
    expect(() => readPage(ganadero, stranger, '2026-09-30', now)).toThrow();
  });

  it('decodes Windows-1252 pages without leaving replacement characters', () => {
    const bytes = Buffer.from([0x64, 0xed, 0x61]);
    expect(decodePage(bytes)).toBe('día');
    expect(decodePage(Buffer.from('día', 'utf8'))).toBe('día');
  });

  it('shows the text a visitor sees, not the scripts', () => {
    expect(visibleText('<p>hola</p><script>var x = "USDC";</script><b>mundo</b>')).toBe(
      'hola mundo',
    );
  });

  it('dates a reading in La Paz, four hours behind UTC', () => {
    expect(laPazDate(new Date('2026-10-01T02:30:00Z'))).toBe('2026-09-30');
  });
});

describe('merging a reading into the seed', () => {
  const now = new Date('2026-09-30T15:00:00Z');
  const ganadero = PAGES.find((page) => page.bank === 'GANADERO');
  const body = Buffer.from(
    `<html>Banco Ganadero comprar, vender y custodiar USDC ${'relleno '.repeat(700)}</html>`,
  );

  it('keeps the announcement and adds the day', () => {
    if (!ganadero) throw new Error('falta la página de Ganadero');
    const merged = mergeSeed([], readPage(ganadero, body, '2026-09-30', now));
    const offered = merged.find((one) => one.indicatorCode === 'VASP_GANADERO_USDC_OFFERED');
    expect(offered?.points.map((point) => point.date)).toEqual(['2025-08-28', '2026-09-30']);
  });

  it('does not rewrite a day that was read again with the same figure', () => {
    if (!ganadero) throw new Error('falta la página de Ganadero');
    const first = mergeSeed([], readPage(ganadero, body, '2026-09-30', now));
    const later = new Date('2026-09-30T21:00:00Z');
    const second = mergeSeed(first, readPage(ganadero, body, '2026-09-30', later));
    expect(JSON.stringify(second)).toBe(JSON.stringify(first));
  });

  it('never drops a day it already held', () => {
    if (!ganadero) throw new Error('falta la página de Ganadero');
    const first = mergeSeed([], readPage(ganadero, body, '2026-09-30', now));
    const next = mergeSeed(first, readPage(ganadero, body, '2026-10-01', now));
    const offered = next.find((one) => one.indicatorCode === 'VASP_GANADERO_USDC_OFFERED');
    expect(offered?.points).toHaveLength(3);
  });
});
