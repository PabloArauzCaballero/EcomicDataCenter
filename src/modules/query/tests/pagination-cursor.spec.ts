import { decodeCursor, encodeCursor } from '../pagination-cursor';

describe('pagination cursor', () => {
  const cursor = { periodStart: '2026-06-30', seriesKey: 'BO.CPI.M.TOTAL' };

  it('round-trips a position', () => {
    expect(decodeCursor(encodeCursor(cursor))).toEqual(cursor);
  });

  it('produces a url-safe token', () => {
    expect(encodeCursor(cursor)).toMatch(/^[A-Za-z0-9_-]+$/u);
  });

  it('rejects a token that is not valid base64url json', () => {
    expect(() => decodeCursor('not-a-cursor')).toThrow(/malformed/iu);
  });

  it('rejects a token whose payload has the wrong shape', () => {
    const forged = Buffer.from(JSON.stringify({ periodStart: 'yesterday' })).toString('base64url');
    expect(() => decodeCursor(forged)).toThrow(/malformed/iu);
  });

  it('rejects an injected value rather than passing it to SQL', () => {
    const injected = Buffer.from(
      JSON.stringify({ periodStart: "2026-01-01'; DROP TABLE x; --", seriesKey: 'x' }),
    ).toString('base64url');
    expect(() => decodeCursor(injected)).toThrow(/malformed/iu);
  });

  it('accepts a series key containing punctuation', () => {
    const punctuated = { periodStart: '2026-01-01', seriesKey: 'BO:CPI/M.TOTAL-2026' };
    expect(decodeCursor(encodeCursor(punctuated))).toEqual(punctuated);
  });
});
