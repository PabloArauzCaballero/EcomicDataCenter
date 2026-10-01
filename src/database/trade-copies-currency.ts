import { refreshSnapshots, type RefreshReport, type RefreshSession } from './snapshot-refresh';

/** The stored copies built from the customs register, in rebuild order. */
export const TRADE_COPIES = ['trade_flow', 'trade_product', 'trade_code'] as const;

/** PostgreSQL's code for a function the server does not have. */
const UNDEFINED_FUNCTION = '42883';

const CURRENCY_SQL = 'SELECT read_models.trade_copies_are_current() AS current';

type CurrencyRow = { readonly current?: boolean | null };

/**
 * Whether the trade copies say what the register holds, read from the database.
 *
 * Migration 0092 defines the question. Before it, «do these copies need a
 * rebuild?» was answered from what the current process had just done — a block
 * came in, or the copy had never been built — and a copy built empty whose
 * rebuild died with its process matched neither, so it stayed empty for good
 * (Contabo, 2026-10-01). Asking the data has no such blind spot.
 *
 * A database that has not reached 0092 cannot answer. That is reported as
 * «current», which is the old behaviour: the caller's own rule still applies,
 * and a boot is the wrong place to fail over a missing probe.
 */
export async function tradeCopiesAreCurrent(
  run: (sql: string) => Promise<ReadonlyArray<CurrencyRow>>,
): Promise<boolean> {
  try {
    const rows = await run(CURRENCY_SQL);
    return rows[0]?.current === true;
  } catch (error) {
    const code = error as { parent?: { code?: unknown }; code?: unknown } | null;
    const sqlState = code?.parent?.code ?? code?.code;
    if (sqlState === UNDEFINED_FUNCTION) return true;
    throw error;
  }
}

/** The same question, asked through a Sequelize handle instead of a pinned session. */
export function tradeCopiesAreCurrentIn(database: {
  query(sql: string, options?: unknown): Promise<unknown>;
}): Promise<boolean> {
  return tradeCopiesAreCurrent(
    async (sql) => (await database.query(sql, { type: 'SELECT' })) as ReadonlyArray<CurrencyRow>,
  );
}

/**
 * Rebuilds the trade copies when the register has moved on without them.
 *
 * Runs on the API's pinned session right after `refreshSnapshots`, which fills
 * the copies that were never built; this covers the ones that were built and
 * are wrong. The advisory lock that call took is still held by the session, and
 * taking it again from the same session succeeds, so a second API replica
 * starting at the same time still backs off. Returns the copies it rebuilt.
 */
export async function refreshStaleTradeCopies(
  session: RefreshSession,
  report: RefreshReport,
): Promise<string[]> {
  const current = await tradeCopiesAreCurrent(async (sql) => {
    const { rows } = await session.query<CurrencyRow>(sql);
    return rows;
  });
  if (current) return [];
  report.line('las copias del aduanero no coinciden con el registro; se reconstruyen');
  const outcome = await refreshSnapshots(session, report, {
    onlyUnbuilt: false,
    only: TRADE_COPIES,
  });
  return outcome?.built ?? [];
}
