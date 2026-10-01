import { readFile } from 'node:fs/promises';
import { join } from 'node:path';
import { bankVirtualAssetsSchema } from '../schemas/bank-virtual-assets.schema';
import {
  decodePage,
  laPazDate,
  mergeSeed,
  plainAmount,
  readPage,
  readQuoteFeed,
  visibleText,
} from '../../../../scripts/banks/bank-readings';
import { PAGES, QUOTE_FEEDS } from '../../../../scripts/banks/bank-sources';
import { quoteReadings } from '../../../../scripts/banks/bank-quote-capture';

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

describe('a quotation captured by hand', () => {
  const capture = {
    bank: 'BNB',
    clientBuys: '9,35',
    clientSells: '9.30',
    date: '2026-09-30',
    source: 'captura de BNB Móvil, 15:20',
    now: new Date('2026-09-30T19:30:00Z'),
  };

  it('writes both sides from the client, in plain decimals and marked as a capture', () => {
    const readings = quoteReadings(capture);
    const byCode = new Map(readings.map((one) => [one.indicatorCode, one.point]));
    expect(byCode.get('VASP_BNB_USDT_QUOTE_CLIENT_BUYS')?.value).toBe('9.35');
    expect(byCode.get('VASP_BNB_USDT_QUOTE_CLIENT_SELLS')?.value).toBe('9.30');
    for (const point of byCode.values()) expect(point.basis).toBe('USER_CAPTURE');
  });

  it('refuses a bank that is not followed, a figure that is not one and a source left blank', () => {
    expect(() => quoteReadings({ ...capture, bank: 'NADA' })).toThrow(/no hay un banco/u);
    expect(() => quoteReadings({ ...capture, clientBuys: '9,3x' })).toThrow(/no es una cifra/u);
    expect(() => quoteReadings({ ...capture, source: 'app' })).toThrow(/de dónde salió/u);
    expect(() => quoteReadings({ ...capture, date: '30/09/2026' })).toThrow(/AAAA-MM-DD/u);
  });

  it('enters the seed next to the announcement without disturbing it', () => {
    const merged = mergeSeed([], quoteReadings(capture));
    const buys = merged.find((one) => one.indicatorCode === 'VASP_BNB_USDT_QUOTE_CLIENT_BUYS');
    expect(buys?.side).toBe('CLIENT_BUYS');
    expect(buys?.points).toHaveLength(1);
    expect(
      merged.find((one) => one.indicatorCode === 'VASP_BNB_USDT_OFFERED')?.points[0]?.basis,
    ).toBe('FIRST_PUBLIC_DOCUMENT');
    expect(() => bankVirtualAssetsSchema.parse({ series: merged })).not.toThrow();
  });

  it('rejects a quotation that claims to be read from a page, or that is not a price', () => {
    const [buys] = mergeSeed([], quoteReadings(capture)).filter((one) => one.kind === 'QUOTE');
    if (!buys) throw new Error('falta la serie');
    const page = {
      ...buys,
      points: buys.points.map((p) => ({ ...p, basis: 'OFFICIAL_PAGE' as const })),
    };
    expect(() => bankVirtualAssetsSchema.parse({ series: [page] })).toThrow();
    const cheap = { ...buys, points: buys.points.map((p) => ({ ...p, value: '0.5' })) };
    expect(() => bankVirtualAssetsSchema.parse({ series: [cheap] })).toThrow();
  });
});

describe('a quotation the bank publishes in its own file', () => {
  const feed = QUOTE_FEEDS.find((one) => one.bank === 'BISA');
  if (!feed) throw new Error('falta el archivo de BISA');
  const now = new Date('2026-10-01T20:40:00Z');
  /* El archivo de verdad, el 2026-10-01 20:50 GMT, recortado a lo que lee el colector. */
  const xml = (usdt: string) =>
    Buffer.from(
      `<?xml version="1.0" encoding="UTF-8"?><soapenv:Envelope><soapenv:Body><ns1:ObtenerCotizacionResponse><ns1:Cotizaciones>` +
        `<ns1:Cotizacion><ns1:Moneda>USD</ns1:Moneda><ns1:MonedaCambio>BOB</ns1:MonedaCambio><ns1:ValorCompra>11.30</ns1:ValorCompra><ns1:ValorVenta>12.30</ns1:ValorVenta></ns1:Cotizacion>` +
        usdt +
        `<ns1:Cotizacion><ns1:Moneda>UST</ns1:Moneda><ns1:MonedaCambio>USD</ns1:MonedaCambio><ns1:ValorCompra>0.9999</ns1:ValorCompra><ns1:ValorVenta>0</ns1:ValorVenta></ns1:Cotizacion>` +
        `</ns1:Cotizaciones></ns1:ObtenerCotizacionResponse></soapenv:Body></soapenv:Envelope>`,
    );
  const usdt = (buy: string, sell: string) =>
    `<ns1:Cotizacion><ns1:Moneda>UST</ns1:Moneda><ns1:MonedaCambio>BOB</ns1:MonedaCambio><ns1:ValorCompra>${buy}</ns1:ValorCompra><ns1:ValorVenta>${sell}</ns1:ValorVenta></ns1:Cotizacion>`;

  it('puts what the bank sells on the side the client pays, and what it buys on the side the client receives', () => {
    const byCode = new Map(
      readQuoteFeed(feed, xml(usdt('11.15', '12.20')), '2026-10-01', now).map((one) => [
        one.indicatorCode,
        one.point,
      ]),
    );
    // El banco COMPRA a 11.15: el cliente que vende recibe 11.15. El banco VENDE a 12.20: el cliente paga 12.20.
    expect(byCode.get('VASP_BISA_USDT_QUOTE_CLIENT_BUYS')?.value).toBe('12.20');
    expect(byCode.get('VASP_BISA_USDT_QUOTE_CLIENT_SELLS')?.value).toBe('11.15');
    for (const point of byCode.values()) {
      expect(point.basis).toBe('OFFICIAL_FEED');
      expect(point.sourceUrl).toBe('https://sjoven.bisa.com/assets/cotizaciones.xml');
      expect(point.excerpt).toContain('<ns1:Moneda>UST</ns1:Moneda>');
    }
  });

  it('reads UST against BOB and not the dollar or UST against USD that sit around it', () => {
    const [buys] = readQuoteFeed(feed, xml(usdt('11.15', '12.20')), '2026-10-01', now);
    expect(buys?.point.value).not.toBe('12.30');
    expect(buys?.point.value).not.toBe('0.9999');
  });

  it('refuses a file without the pair, or with a price that is not one', () => {
    expect(() => readQuoteFeed(feed, xml(''), '2026-10-01', now)).toThrow(/no trae UST\/BOB/u);
    expect(() => readQuoteFeed(feed, xml(usdt('0', '12.20')), '2026-10-01', now)).toThrow(
      /compra y una venta/u,
    );
    expect(() => readQuoteFeed(feed, xml(usdt('11.15', '')), '2026-10-01', now)).toThrow(
      /compra y una venta/u,
    );
    expect(() => readQuoteFeed(feed, Buffer.from('<html>403</html>'), '2026-10-01', now)).toThrow();
  });

  it('enters the seed as a valid quotation, and the same value twice in a day leaves it alone', () => {
    const first = mergeSeed([], readQuoteFeed(feed, xml(usdt('11.15', '12.20')), '2026-10-01', now));
    expect(() => bankVirtualAssetsSchema.parse({ series: first })).not.toThrow();
    const again = mergeSeed(
      first,
      readQuoteFeed(feed, xml(usdt('11.15', '12.20')), '2026-10-01', new Date('2026-10-01T22:00:00Z')),
    );
    expect(JSON.stringify(again)).toBe(JSON.stringify(first));
    const moved = mergeSeed(first, readQuoteFeed(feed, xml(usdt('11.20', '12.25')), '2026-10-01', now));
    const buys = moved.find((one) => one.indicatorCode === 'VASP_BISA_USDT_QUOTE_CLIENT_BUYS');
    expect(buys?.points).toHaveLength(1);
    expect(buys?.points[0]?.value).toBe('12.25');
  });

  it('is the only basis, besides a capture, that a price may carry', () => {
    const [buys] = mergeSeed([], readQuoteFeed(feed, xml(usdt('11.15', '12.20')), '2026-10-01', now)).filter(
      (one) => one.kind === 'QUOTE',
    );
    if (!buys) throw new Error('falta la serie');
    const announced = {
      ...buys,
      points: buys.points.map((p) => ({ ...p, basis: 'ANNOUNCEMENT' as const })),
    };
    expect(() => bankVirtualAssetsSchema.parse({ series: [announced] })).toThrow();
    const offered = mergeSeed([], []).find((one) => one.kind === 'OFFERED');
    const feedOnService = offered
      ? { ...offered, points: offered.points.map((p) => ({ ...p, basis: 'OFFICIAL_FEED' as const })) }
      : undefined;
    expect(feedOnService).toBeDefined();
    expect(() => bankVirtualAssetsSchema.parse({ series: [feedOnService] })).toThrow();
  });
});
