import { Inject, Injectable } from '@nestjs/common';
import { QueryTypes, type Sequelize } from 'sequelize';
import { InfrastructureError } from '../../common/errors/application.error';
import { WRITER_DATABASE } from '../../database/database.tokens';
import { INQUIRY_COLUMNS, type InquiryRow } from './inquiry-row';
import type { InquirySubmission, InquiryUpdate } from './inquiry.schemas';

export interface InquiryReceipt {
  readonly serviceInquiryId: string;
  readonly duplicate: boolean;
}

/**
 * Writes the service-inquiry register.
 *
 * Idempotency is the unique key on `request_id` and `DO NOTHING`, never a
 * check-then-insert: the site retries a delivery it is not sure landed, and two
 * concurrent retries must produce one row. When the insert finds the key taken
 * it waits for the other transaction, so the follow-up read always sees the row
 * that won.
 *
 * Nothing here logs. The rows carry a person's name, e-mail, phone and words,
 * and none of that belongs in a log line or an error message.
 */
@Injectable()
export class InquiryWriteRepository {
  constructor(@Inject(WRITER_DATABASE) private readonly writer: Sequelize) {}

  async submit(inquiry: InquirySubmission): Promise<InquiryReceipt> {
    const inserted = await this.writer.query<{ service_inquiry_id: string }>(
      `INSERT INTO operations.service_inquiry (
         request_id, full_name, email, organization, phone, plan_code, message, source_route
       ) VALUES (
         CAST(:requestId AS uuid), :fullName, :email, CAST(:organization AS text),
         CAST(:phone AS text), :planCode, :message, :sourceRoute
       )
       ON CONFLICT (request_id) DO NOTHING
       RETURNING service_inquiry_id::text AS service_inquiry_id`,
      {
        type: QueryTypes.SELECT,
        replacements: {
          requestId: inquiry.requestId,
          fullName: inquiry.fullName,
          email: inquiry.email,
          organization: inquiry.organization,
          phone: inquiry.phone,
          planCode: inquiry.planCode,
          message: inquiry.message,
          sourceRoute: inquiry.sourceRoute,
        },
      },
    );
    const created = inserted[0];
    if (created) return { serviceInquiryId: created.service_inquiry_id, duplicate: false };

    const existing = await this.writer.query<{ service_inquiry_id: string }>(
      `SELECT service_inquiry_id::text AS service_inquiry_id
         FROM operations.service_inquiry
        WHERE request_id = CAST(:requestId AS uuid)`,
      { type: QueryTypes.SELECT, replacements: { requestId: inquiry.requestId } },
    );
    const original = existing[0];
    if (!original) {
      // Unreachable while the unique key exists: DO NOTHING only skips a row
      // because another one holds the key. Said out loud instead of returning
      // an identifier that names nothing.
      throw new InfrastructureError('The inquiry register refused a row it does not hold');
    }
    return { serviceInquiryId: original.service_inquiry_id, duplicate: true };
  }

  /**
   * Moves one inquiry to a new state and says who did it.
   *
   * Returns null when the identifier names no inquiry, so the caller can answer
   * 404 instead of claiming an update that touched nothing.
   */
  async update(
    serviceInquiryId: string,
    change: InquiryUpdate,
    actorSubject: string,
  ): Promise<InquiryRow | null> {
    const rows = await this.writer.query<InquiryRow>(
      `UPDATE operations.service_inquiry
          SET status = :status,
              operator_note = CASE WHEN :keepNote THEN operator_note
                                   ELSE CAST(:operatorNote AS text) END,
              updated_at = now(),
              updated_by = :actorSubject
        WHERE service_inquiry_id = CAST(:serviceInquiryId AS uuid)
        RETURNING ${INQUIRY_COLUMNS}`,
      {
        type: QueryTypes.SELECT,
        replacements: {
          serviceInquiryId,
          status: change.status,
          keepNote: change.operatorNote === undefined,
          operatorNote: change.operatorNote ?? null,
          actorSubject: actorSubject.slice(0, 200),
        },
      },
    );
    return rows[0] ?? null;
  }
}
