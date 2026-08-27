import { readFile } from 'node:fs/promises';
import { join } from 'node:path';
import { bbvYieldsSchema } from '../schemas/bbv-yields.schema';

/**
 * Guards the exchange's closing yield curve.
 *
 * The thing that would quietly ruin this series is a row losing one of the five
 * dimensions that give a yield meaning — a rate filed without its maturity band
 * or its currency reads like a number and is not one. So the tests hold the
 * dimensions rather than the values, which change every session.
 */
describe('BBV yield curve snapshot', () => {
  const load = async () =>
    bbvYieldsSchema.parse(
      JSON.parse(await readFile(join(__dirname, '..', 'boot', 'bbv-yields.json'), 'utf8')),
    );

  it('reaches the sovereign issuers, which are the point of collecting it', async () => {
    const { yields } = await load();
    const issuers = new Set(yields.map((quote) => quote.issuer));

    // The Treasury issues the debt and the central bank the paper the short end
    // is priced off. A session with neither would mean the parser lost the rows.
    expect(issuers.has('TGN') || issuers.has('BCB')).toBe(true);
    expect(yields.some((quote) => quote.instrument === 'BTS')).toBe(true);
  });

  it('keeps every dimension that makes a yield readable', async () => {
    const { yields } = await load();

    for (const quote of yields) {
      expect(quote.tenorBucket).toMatch(/^\d+-(?:\d+|Más)$/u);
      expect(['BOB', 'USD', 'UFV']).toContain(quote.currency);
      expect(['COMPRAVENTA', 'REPORTO']).toContain(quote.operation);
      expect(quote.segment.length).toBeGreaterThan(0);
      // Zero is a rate the exchange really prints — dollar paper at the short
      // end quotes at 0.00% — so the floor is non-negative, not positive.
      expect(Number(quote.value)).toBeGreaterThanOrEqual(0);
    }
  });

  it('files no two rates under the same session, instrument, issuer and band', async () => {
    const { yields } = await load();
    const keys = yields.map((quote) =>
      [
        quote.eventDate,
        quote.currency,
        quote.operation,
        quote.instrument,
        quote.issuer,
        quote.tenorBucket,
      ].join('|'),
    );

    expect(new Set(keys).size).toBe(keys.length);
  });

  it('quotes each rate in the fragment it was read from', async () => {
    const { yields } = await load();

    for (const quote of yields) {
      expect(quote.statedValue).toBe(`${quote.value}%`);
      expect(quote.excerpt).toContain(quote.statedValue);
      expect(quote.excerpt).toContain(quote.tenorBucket);
      expect(quote.documentSha256).toMatch(/^[a-f0-9]{64}$/u);
    }
  });
});
