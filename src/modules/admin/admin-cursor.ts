import { RequestValidationError } from '../../common/errors/application.error';

/**
 * A stable position in a listing ordered by instant and then identifier.
 *
 * Offset paging drifts under a register that is being appended to while it is
 * being read: a row inserted between two pages pushes one row onto the next
 * page and the reader never sees it. Keyset paging cannot lose a row that way,
 * and the tie-break on the identifier is what makes it total — two events in
 * the same millisecond would otherwise share a position.
 */
export interface ListCursor {
  readonly occurredAt: string;
  readonly identifier: string;
}

export function encodeCursor(cursor: ListCursor): string {
  return Buffer.from(`${cursor.occurredAt}|${cursor.identifier}`, 'utf8').toString('base64url');
}

/**
 * Reads a cursor the server issued, refusing anything else.
 *
 * A malformed cursor is a client error, not a reason to serve page one: a
 * silent fallback would let a truncated URL return the newest rows while the
 * reader believed they were looking at the continuation of a list.
 */
export function decodeCursor(value: string): ListCursor {
  const raw = Buffer.from(value, 'base64url').toString('utf8');
  const separator = raw.indexOf('|');
  const occurredAt = separator === -1 ? '' : raw.slice(0, separator);
  const identifier = separator === -1 ? '' : raw.slice(separator + 1);
  if (!occurredAt || !identifier || Number.isNaN(Date.parse(occurredAt))) {
    throw new RequestValidationError({
      cursor: 'The pagination cursor is not one this API issued',
    });
  }
  return { occurredAt, identifier };
}

/**
 * Splits an over-fetched page into the page itself and the cursor that follows.
 *
 * Asking the database for one row more than the page size is how the listing
 * knows whether there is a next page without running a second count query,
 * which on an append-only register would be both slower and racy.
 */
export function paginate<T>(
  rows: readonly T[],
  pageSize: number,
  position: (row: T) => ListCursor,
): { items: readonly T[]; nextCursor: string | null } {
  if (rows.length <= pageSize) return { items: rows, nextCursor: null };
  const items = rows.slice(0, pageSize);
  const last = items[items.length - 1];
  return { items, nextCursor: last ? encodeCursor(position(last)) : null };
}
