import { Inject, Injectable } from '@nestjs/common';
import { QueryTypes, type Sequelize } from 'sequelize';
import { WRITER_DATABASE } from '../../database/database.tokens';
import { ACCOUNT_COLUMNS, type AccountRow } from './subscription-account-row';

export interface PaymentRow {
  readonly subscriber_payment_id: string;
  readonly subscriber_account_id: string;
  readonly amount_bob: string;
  readonly covers_until: string;
  readonly reference: string | null;
  readonly recorded_by: string;
  readonly recorded_at: Date;
}

const PAYMENT_COLUMNS = `
  subscriber_payment_id::text AS subscriber_payment_id,
  subscriber_account_id::text AS subscriber_account_id, amount_bob::text AS amount_bob,
  to_char(covers_until, 'YYYY-MM-DD') AS covers_until, reference, recorded_by, recorded_at`;

/**
 * The ledger of what subscribers paid, and the plan each payment extends.
 *
 * The writer may insert and read `subscriber_payment`, never update or delete
 * it. Nothing here logs.
 */
@Injectable()
export class SubscriberPaymentRepository {
  constructor(@Inject(WRITER_DATABASE) private readonly writer: Sequelize) {}

  /**
   * Records a payment and moves the account to ACTIVE, together.
   *
   * `paid_until` only moves forward: GREATEST keeps the later of what is stored
   * and what this payment covers, so a late-recorded payment for an earlier
   * period cannot shorten a plan another payment already extended. (GREATEST
   * ignores a NULL, so the first payment simply sets it.)
   *
   * The ledger row is inserted, never updated: a mistaken payment is corrected
   * by recording another, so the history of what was received stays whole.
   */
  async recordPayment(
    subscriberAccountId: string,
    payment: { amountBob: number; coversUntil: string; reference: string | null },
    paidUntil: Date,
    recordedBy: string,
  ): Promise<{ payment: PaymentRow; account: AccountRow } | null> {
    return this.writer.transaction(async (transaction) => {
      const accounts = await this.writer.query<AccountRow>(
        `UPDATE operations.subscriber_account
            SET paid_until = GREATEST(paid_until, CAST(:paidUntil AS timestamptz)),
                status = 'ACTIVE', updated_at = now()
          WHERE subscriber_account_id = CAST(:subscriberAccountId AS uuid)
          RETURNING ${ACCOUNT_COLUMNS}`,
        {
          type: QueryTypes.SELECT,
          transaction,
          replacements: { subscriberAccountId, paidUntil: paidUntil.toISOString() },
        },
      );
      const account = accounts[0];
      if (!account) return null;
      const payments = await this.writer.query<PaymentRow>(
        `INSERT INTO operations.subscriber_payment (
           subscriber_account_id, amount_bob, covers_until, reference, recorded_by
         ) VALUES (
           CAST(:subscriberAccountId AS uuid), CAST(:amountBob AS numeric(12,2)),
           CAST(:coversUntil AS date), CAST(:reference AS text), :recordedBy
         )
         RETURNING ${PAYMENT_COLUMNS}`,
        {
          type: QueryTypes.SELECT,
          transaction,
          replacements: {
            subscriberAccountId,
            amountBob: payment.amountBob.toFixed(2),
            coversUntil: payment.coversUntil,
            reference: payment.reference,
            recordedBy: recordedBy.slice(0, 200),
          },
        },
      );
      return { payment: payments[0]!, account };
    });
  }

  async listPayments(subscriberAccountId: string): Promise<PaymentRow[]> {
    return this.writer.query<PaymentRow>(
      `SELECT ${PAYMENT_COLUMNS} FROM operations.subscriber_payment
        WHERE subscriber_account_id = CAST(:subscriberAccountId AS uuid)
        ORDER BY recorded_at DESC, subscriber_payment_id DESC`,
      { type: QueryTypes.SELECT, replacements: { subscriberAccountId } },
    );
  }
}
