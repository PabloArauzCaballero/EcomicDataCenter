import { Inject, Injectable } from '@nestjs/common';
import { QueryTypes, type Sequelize } from 'sequelize';
import { NotFoundError, RequestValidationError } from '../../common/errors/application.error';
import { WRITER_DATABASE } from '../../database/database.tokens';
import { decodeCursor } from './admin-cursor';
import { ACCOUNT_COLUMNS, CURRENT_MONTH, type AccountRow } from './subscription-account-row';
import type { IssuedToken } from './subscription-secrets';
import type {
  AccountCreation,
  AccountListQuery,
  AccountStatus,
  AccountUpdate,
  TokenPurpose,
  UsageKind,
} from './subscription.schemas';

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/iu;

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
 * The operator's side of the subscriber register: open accounts, change them,
 * record payments and issue tokens.
 *
 * Every method that can name a missing account says so (null or NotFoundError)
 * instead of reporting a change that touched nothing. Nothing here logs.
 */
@Injectable()
export class SubscriberAdminRepository {
  constructor(@Inject(WRITER_DATABASE) private readonly writer: Sequelize) {}

  async list(query: AccountListQuery): Promise<AccountRow[]> {
    const cursor = query.cursor ? decodeCursor(query.cursor) : null;
    if (cursor && !UUID.test(cursor.identifier)) {
      throw new RequestValidationError({
        cursor: 'The pagination cursor is not one this API issued',
      });
    }
    return this.writer.query<AccountRow>(
      `SELECT ${ACCOUNT_COLUMNS}
         FROM operations.subscriber_account
        WHERE (CAST(:status AS text) IS NULL OR status = :status)
          AND (
            CAST(:cursorAt AS timestamptz) IS NULL
            OR (created_at, subscriber_account_id)
               < (CAST(:cursorAt AS timestamptz), CAST(:cursorId AS uuid))
          )
        ORDER BY created_at DESC, subscriber_account_id DESC
        LIMIT :limit`,
      {
        type: QueryTypes.SELECT,
        replacements: {
          status: query.status ?? null,
          cursorAt: cursor?.occurredAt ?? null,
          cursorId: cursor?.identifier ?? null,
          limit: query.pageSize + 1,
        },
      },
    );
  }

  /** This month's counters for a set of accounts, keyed by account. */
  async currentUsage(accountIds: readonly string[]): Promise<Map<string, Map<UsageKind, number>>> {
    const usage = new Map<string, Map<UsageKind, number>>();
    if (accountIds.length === 0) return usage;
    const rows = await this.writer.query<{
      subscriber_account_id: string;
      usage_kind: UsageKind;
      used: number;
    }>(
      `SELECT subscriber_account_id::text AS subscriber_account_id, usage_kind, used
         FROM operations.subscriber_usage
        WHERE subscriber_account_id IN (:accountIds) AND period_month = ${CURRENT_MONTH}`,
      { type: QueryTypes.SELECT, replacements: { accountIds: [...accountIds] } },
    );
    for (const row of rows) {
      const counts = usage.get(row.subscriber_account_id) ?? new Map<UsageKind, number>();
      counts.set(row.usage_kind, Number(row.used));
      usage.set(row.subscriber_account_id, counts);
    }
    return usage;
  }

  /**
   * Opens an account and its activation token together, or neither.
   *
   * Returns null when the e-mail already has an account: the unique key and
   * `DO NOTHING` decide it, never a check-then-insert that two operators could
   * race through.
   */
  async create(
    input: AccountCreation,
    status: AccountStatus,
    paidUntil: Date | null,
    token: IssuedToken,
  ): Promise<AccountRow | null> {
    return this.writer.transaction(async (transaction) => {
      if (input.serviceInquiryId) {
        const inquiry = await this.writer.query<{ found: number }>(
          `SELECT 1 AS found FROM operations.service_inquiry
            WHERE service_inquiry_id = CAST(:serviceInquiryId AS uuid)`,
          {
            type: QueryTypes.SELECT,
            transaction,
            replacements: { serviceInquiryId: input.serviceInquiryId },
          },
        );
        if (inquiry.length === 0)
          throw new NotFoundError('Service inquiry', input.serviceInquiryId);
      }
      const rows = await this.writer.query<AccountRow>(
        `INSERT INTO operations.subscriber_account (
           email, full_name, organization, plan_code, billing_period, status, paid_until,
           service_inquiry_id
         ) VALUES (
           :email, :fullName, CAST(:organization AS text), :planCode, :billingPeriod, :status,
           CAST(:paidUntil AS timestamptz), CAST(:serviceInquiryId AS uuid)
         )
         ON CONFLICT (email) DO NOTHING
         RETURNING ${ACCOUNT_COLUMNS}`,
        {
          type: QueryTypes.SELECT,
          transaction,
          replacements: {
            email: input.email,
            fullName: input.fullName,
            organization: input.organization,
            planCode: input.planCode,
            billingPeriod: input.billingPeriod,
            status,
            paidUntil: paidUntil ? paidUntil.toISOString() : null,
            serviceInquiryId: input.serviceInquiryId,
          },
        },
      );
      const account = rows[0];
      if (!account) return null;
      await this.writer.query(
        `INSERT INTO operations.subscriber_token (token_hash, subscriber_account_id, purpose, expires_at)
         VALUES (:hash, CAST(:subscriberAccountId AS uuid), 'ACTIVATE', CAST(:expiresAt AS timestamptz))`,
        {
          type: QueryTypes.INSERT,
          transaction,
          replacements: {
            hash: token.hash,
            subscriberAccountId: account.subscriber_account_id,
            expiresAt: token.expiresAt.toISOString(),
          },
        },
      );
      return account;
    });
  }

  /** Applies an operator's change; absent fields keep their stored value. */
  async update(subscriberAccountId: string, change: AccountUpdate): Promise<AccountRow | null> {
    const rows = await this.writer.query<AccountRow>(
      `UPDATE operations.subscriber_account
          SET plan_code = COALESCE(CAST(:planCode AS text), plan_code),
              billing_period = COALESCE(CAST(:billingPeriod AS text), billing_period),
              status = COALESCE(CAST(:status AS text), status),
              legal_name = CASE WHEN :keepLegalName THEN legal_name ELSE CAST(:legalName AS text) END,
              tax_id = CASE WHEN :keepTaxId THEN tax_id ELSE CAST(:taxId AS text) END,
              organization = CASE WHEN :keepOrganization THEN organization
                                  ELSE CAST(:organization AS text) END,
              updated_at = now()
        WHERE subscriber_account_id = CAST(:subscriberAccountId AS uuid)
        RETURNING ${ACCOUNT_COLUMNS}`,
      {
        type: QueryTypes.SELECT,
        replacements: {
          subscriberAccountId,
          planCode: change.planCode ?? null,
          billingPeriod: change.billingPeriod ?? null,
          status: change.status ?? null,
          keepLegalName: change.legalName === undefined,
          legalName: change.legalName ?? null,
          keepTaxId: change.taxId === undefined,
          taxId: change.taxId ?? null,
          keepOrganization: change.organization === undefined,
          organization: change.organization ?? null,
        },
      },
    );
    return rows[0] ?? null;
  }

  /**
   * Records a payment and moves the account to ACTIVE until `paidUntil`, together.
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
            SET paid_until = CAST(:paidUntil AS timestamptz), status = 'ACTIVE', updated_at = now()
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

  /** Stores a new one-time token. Returns false when the account does not exist. */
  async issueToken(
    subscriberAccountId: string,
    purpose: TokenPurpose,
    token: IssuedToken,
  ): Promise<boolean> {
    const rows = await this.writer.query<{ token_hash: string }>(
      `INSERT INTO operations.subscriber_token (token_hash, subscriber_account_id, purpose, expires_at)
       SELECT :hash, subscriber_account_id, :purpose, CAST(:expiresAt AS timestamptz)
         FROM operations.subscriber_account
        WHERE subscriber_account_id = CAST(:subscriberAccountId AS uuid)
       RETURNING token_hash`,
      {
        type: QueryTypes.SELECT,
        replacements: {
          subscriberAccountId,
          purpose,
          hash: token.hash,
          expiresAt: token.expiresAt.toISOString(),
        },
      },
    );
    return rows.length > 0;
  }
}
