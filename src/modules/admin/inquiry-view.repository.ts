import { Injectable } from '@nestjs/common';
import { QueryTypes } from 'sequelize';
import { RequestValidationError } from '../../common/errors/application.error';
import { ReadQueryExecutor } from '../../common/persistence/read-query.executor';
import { decodeCursor } from './admin-cursor';
import { INQUIRY_COLUMNS, type InquiryRow } from './inquiry-row';
import { INQUIRY_STATUSES, type InquiryListQuery, type InquiryStatus } from './inquiry.schemas';

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/iu;

/**
 * Reads the service-inquiry register for the console, newest first.
 *
 * The listing is keyset-paged on (created_at, id) like every other register in
 * the console, and the cursor is checked before it reaches SQL: a cursor whose
 * identifier is not a UUID would otherwise fail inside PostgreSQL and surface
 * as a server error instead of the client error it is.
 */
@Injectable()
export class InquiryViewRepository {
  constructor(private readonly executor: ReadQueryExecutor) {}

  async list(query: InquiryListQuery): Promise<InquiryRow[]> {
    const cursor = query.cursor ? decodeCursor(query.cursor) : null;
    if (cursor && !UUID.test(cursor.identifier)) {
      throw new RequestValidationError({
        cursor: 'The pagination cursor is not one this API issued',
      });
    }
    return this.executor.run('operations.service_inquiries', ({ database, transaction }) =>
      database.query<InquiryRow>(
        `
SELECT ${INQUIRY_COLUMNS}
FROM operations.service_inquiry
WHERE (CAST(:status AS text) IS NULL OR status = :status)
  AND (
    CAST(:cursorAt AS timestamptz) IS NULL
    OR (created_at, service_inquiry_id) < (CAST(:cursorAt AS timestamptz), CAST(:cursorId AS uuid))
  )
ORDER BY created_at DESC, service_inquiry_id DESC
LIMIT :limit
        `,
        {
          type: QueryTypes.SELECT,
          transaction,
          replacements: {
            status: query.status ?? null,
            cursorAt: cursor?.occurredAt ?? null,
            cursorId: cursor?.identifier ?? null,
            // One row more than the page, so the caller knows whether a next page exists.
            limit: query.pageSize + 1,
          },
        },
      ),
    );
  }

  /**
   * How many inquiries sit in each state, every state always present.
   *
   * A state with no rows is reported as zero rather than left out: the counts
   * here are exact over the whole register, so an absent «WON» would only make
   * the console guess whether it means none or not measured.
   */
  async summary(): Promise<Array<{ status: InquiryStatus; count: number }>> {
    const rows = await this.executor.run(
      'operations.service_inquiry_summary',
      ({ database, transaction }) =>
        database.query<{ status: InquiryStatus; count: string }>(
          `
SELECT status, COUNT(*)::text AS count
FROM operations.service_inquiry
GROUP BY status
          `,
          { type: QueryTypes.SELECT, transaction },
        ),
    );
    const counts = new Map(rows.map((row) => [row.status, Number(row.count)]));
    return INQUIRY_STATUSES.map((status) => ({ status, count: counts.get(status) ?? 0 }));
  }
}
