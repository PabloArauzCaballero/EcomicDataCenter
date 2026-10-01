import type { RefreshReport, RefreshSession } from '../snapshot-refresh';
import {
  TRADE_COPIES,
  refreshStaleTradeCopies,
  tradeCopiesAreCurrent,
} from '../trade-copies-currency';

const answer = (current: boolean | null) => async () => [{ current }];

describe('tradeCopiesAreCurrent', () => {
  it('trusts only an explicit yes from the database', async () => {
    await expect(tradeCopiesAreCurrent(answer(true))).resolves.toBe(true);
    await expect(tradeCopiesAreCurrent(answer(false))).resolves.toBe(false);
    await expect(tradeCopiesAreCurrent(answer(null))).resolves.toBe(false);
    await expect(tradeCopiesAreCurrent(async () => [])).resolves.toBe(false);
  });

  it('falls back to «current» on a database that has not reached 0092', async () => {
    const missing = async (): Promise<never> => {
      throw Object.assign(new Error('function does not exist'), { parent: { code: '42883' } });
    };
    await expect(tradeCopiesAreCurrent(missing)).resolves.toBe(true);
  });

  it('does not hide any other failure', async () => {
    const cancelled = async (): Promise<never> => {
      throw Object.assign(new Error('canceling statement due to statement timeout'), {
        parent: { code: '57014' },
      });
    };
    await expect(tradeCopiesAreCurrent(cancelled)).rejects.toThrow('statement timeout');
  });
});

describe('refreshStaleTradeCopies', () => {
  const report: RefreshReport = { line: jest.fn(), problem: jest.fn() };

  function sessionAnswering(current: boolean): { session: RefreshSession; calls: string[] } {
    const calls: string[] = [];
    const session = {
      async query(sql: string, values?: unknown[]) {
        calls.push(sql);
        if (sql.includes('trade_copies_are_current')) return { rows: [{ current }] };
        if (sql.includes('pg_try_advisory_lock')) return { rows: [{ held: true }] };
        if (sql.includes('pg_class')) {
          return { rows: TRADE_COPIES.map((name) => ({ name, built: true })) };
        }
        if (sql.includes('refresh_snapshot')) return { rows: [{ filas: String(values?.[0]) }] };
        return { rows: [] };
      },
    } as RefreshSession;
    return { session, calls };
  }

  it('leaves current copies alone', async () => {
    const { session, calls } = sessionAnswering(true);
    await expect(refreshStaleTradeCopies(session, report)).resolves.toEqual([]);
    expect(calls.some((sql) => sql.includes('refresh_snapshot'))).toBe(false);
  });

  it('rebuilds the three copies when they are stale', async () => {
    const { session, calls } = sessionAnswering(false);
    const rebuilt = await refreshStaleTradeCopies(session, report);
    expect([...rebuilt].sort()).toEqual([...TRADE_COPIES].sort());
    expect(calls.filter((sql) => sql.includes('refresh_snapshot'))).toHaveLength(3);
  });
});
