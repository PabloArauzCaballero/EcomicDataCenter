/** PostgreSQL's code for a function the server does not have. */
const UNDEFINED_FUNCTION = '42883';

/**
 * How many notes one call of `fill_press_readings` reads.
 *
 * A call is one statement, and the ceiling on a statement is exactly what
 * cancelled the press rebuild after an hour on 2026-10-01. A batch of a thousand
 * is a few minutes even on the shared server; what a batch stores survives the
 * next one being cut short, so the first rebuild after the migration resumes
 * where it stopped instead of starting the archive over.
 */
const PRESS_BATCH = 1000;

/**
 * Reads, and stores, the press notes whose reading is missing or out of date.
 *
 * Until 0093 the two press copies re-filed the WHOLE archive on every rebuild —
 * about 120 ms a note, over two hours on Contabo, on every deploy that brought
 * a day's notes. Now a note is filed once and a rebuild only pays for the new
 * ones. Nothing here decides which notes need it: the database does, by
 * comparing each stored reading with the digest of the lexicon that made it.
 *
 * A database that has not reached 0093 has no such routine. The rebuild after
 * this is then the old, slow one, and that is correct, just not fast.
 */
export async function readPressNotes(
  runBatch: (sql: string) => Promise<number>,
  progress?: (readSoFar: number) => void,
): Promise<number> {
  let total = 0;
  for (;;) {
    let read: number;
    try {
      read = await runBatch(`SELECT read_models.fill_press_readings(${PRESS_BATCH})::text AS read`);
    } catch (error) {
      const code = error as { parent?: { code?: unknown }; code?: unknown } | null;
      const sqlState = code?.parent?.code ?? code?.code;
      if (sqlState === UNDEFINED_FUNCTION) return total;
      throw error;
    }
    if (read === 0) return total;
    total += read;
    progress?.(total);
  }
}

/** The narrowest view of a database handle this module needs: one query, rows back. */
interface QueryHandle {
  query(sql: string, options?: unknown): Promise<unknown>;
}

/**
 * `readPressNotes` over a Sequelize-style handle, for the callers that rebuild the
 * two press copies (`press_article_snapshot`, `press_term_mention_snapshot`).
 *
 * Call it right before refreshing them: the refresh then finds every note read and
 * only joins what is stored.
 */
export async function readPressNotesOn(database: QueryHandle): Promise<number> {
  return readPressNotes(async (sql) => {
    const rows = (await database.query(sql, { type: 'SELECT' })) as ReadonlyArray<{
      read?: string;
    }>;
    return Number(rows[0]?.read ?? 0);
  });
}
