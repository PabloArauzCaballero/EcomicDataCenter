import { decodeCursor, encodeCursor, paginate } from '../admin-cursor';
import { envelope, shareOrNull } from '../admin.envelope';

describe('envelope', () => {
  it('admits ignorance by default rather than asserting confidence', () => {
    const result = envelope({ value: 1 }, { environmentId: 'local', requestId: 'req-1' });
    expect(result.meta.evidenceState).toBe('unknown');
    expect(result.meta.observedAt).toBeNull();
    expect(result.meta.environmentId).toBe('local');
    expect(result.meta.requestId).toBe('req-1');
  });

  it('serialises the observed instant as ISO UTC', () => {
    const result = envelope(null, {
      environmentId: 'local',
      requestId: 'req-2',
      observedAt: new Date('2026-09-16T12:00:00.000Z'),
      evidenceState: 'known',
    });
    expect(result.meta.observedAt).toBe('2026-09-16T12:00:00.000Z');
  });
});

describe('shareOrNull', () => {
  /** Zero of zero is not a hundred per cent, and this is where that is decided. */
  it('is null when there is no population', () => {
    expect(shareOrNull(0, 0)).toBeNull();
    expect(shareOrNull(3, -1)).toBeNull();
  });

  it('rounds to two decimals', () => {
    expect(shareOrNull(8, 10)).toBe(80);
    expect(shareOrNull(1, 3)).toBe(33.33);
  });
});

describe('cursor', () => {
  it('round-trips a position', () => {
    const cursor = { occurredAt: '2026-09-16T12:00:00.000Z', identifier: '42' };
    expect(decodeCursor(encodeCursor(cursor))).toEqual(cursor);
  });

  it('refuses a cursor it did not issue instead of serving page one', () => {
    expect(() => decodeCursor('not-a-cursor')).toThrow();
    expect(() => decodeCursor(Buffer.from('nope|42').toString('base64url'))).toThrow();
  });

  it('keeps an identifier that contains the separator intact', () => {
    const cursor = { occurredAt: '2026-09-16T12:00:00.000Z', identifier: 'a|b' };
    expect(decodeCursor(encodeCursor(cursor)).identifier).toBe('a|b');
  });

  it('reports no next page when the over-fetch found nothing extra', () => {
    const rows = [{ at: '2026-09-16T12:00:00.000Z', id: '1' }];
    const page = paginate(rows, 5, (row) => ({ occurredAt: row.at, identifier: row.id }));
    expect(page.nextCursor).toBeNull();
    expect(page.items).toHaveLength(1);
  });

  it('trims the over-fetched row and hands back the cursor that follows', () => {
    const rows = [
      { at: '2026-09-16T12:00:00.000Z', id: '3' },
      { at: '2026-09-16T11:00:00.000Z', id: '2' },
      { at: '2026-09-16T10:00:00.000Z', id: '1' },
    ];
    const page = paginate(rows, 2, (row) => ({ occurredAt: row.at, identifier: row.id }));
    expect(page.items).toHaveLength(2);
    expect(decodeCursor(page.nextCursor ?? '')).toEqual({
      occurredAt: '2026-09-16T11:00:00.000Z',
      identifier: '2',
    });
  });
});
