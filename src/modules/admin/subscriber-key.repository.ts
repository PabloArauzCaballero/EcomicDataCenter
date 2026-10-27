import { Inject, Injectable } from '@nestjs/common';
import { QueryTypes, type Sequelize, type Transaction } from 'sequelize';
import { WRITER_DATABASE } from '../../database/database.tokens';
import {
  ACCOUNT_COLUMNS,
  CURRENT_MONTH,
  effectiveStatus,
  isEntitled,
  type AccountRow,
} from './subscription-account-row';
import type { IssuedApiKey } from './subscription-secrets';
import type { UsageKind } from './subscription.schemas';

export type KeyCreation =
  | { readonly outcome: 'CREATED'; readonly apiKeyId: string }
  | { readonly outcome: 'NO_ACCOUNT' }
  | { readonly outcome: 'LIMIT_REACHED'; readonly active: number };

export interface KeyVerification {
  readonly account: AccountRow;
  readonly used: number;
}

/** Adds `amount` to this month's counter in one statement; returns the new total. */
const INCREMENT = `
INSERT INTO operations.subscriber_usage (subscriber_account_id, period_month, usage_kind, used)
SELECT subscriber_account_id, ${CURRENT_MONTH}, :usageKind, :amount
  FROM operations.subscriber_account
 WHERE subscriber_account_id = CAST(:subscriberAccountId AS uuid)
ON CONFLICT (subscriber_account_id, period_month, usage_kind)
DO UPDATE SET used = operations.subscriber_usage.used + EXCLUDED.used
RETURNING used`;

/**
 * API keys and the usage they meter.
 *
 * Only the SHA-256 of a key reaches this class. Counting is a single upsert
 * that adds to the stored figure, never a read-modify-write, so concurrent
 * requests cannot lose a count.
 */
@Injectable()
export class SubscriberKeyRepository {
  constructor(@Inject(WRITER_DATABASE) private readonly writer: Sequelize) {}

  /**
   * Stores a new key unless the account already holds `maxActiveKeys` active ones.
   *
   * The account row is locked first, so two simultaneous requests cannot both
   * see room for one more key and both insert it.
   */
  async create(
    subscriberAccountId: string,
    label: string,
    maxActiveKeys: number,
    issued: Pick<IssuedApiKey, 'prefix' | 'hash'>,
  ): Promise<KeyCreation> {
    return this.writer.transaction(async (transaction) => {
      const locked = await this.writer.query<{ active: string }>(
        `SELECT (SELECT COUNT(*) FROM operations.subscriber_api_key k
                  WHERE k.subscriber_account_id = a.subscriber_account_id
                    AND k.revoked_at IS NULL)::text AS active
           FROM operations.subscriber_account a
          WHERE a.subscriber_account_id = CAST(:subscriberAccountId AS uuid)
          FOR UPDATE OF a`,
        { type: QueryTypes.SELECT, transaction, replacements: { subscriberAccountId } },
      );
      const account = locked[0];
      if (!account) return { outcome: 'NO_ACCOUNT' } as const;
      const active = Number(account.active);
      if (active >= maxActiveKeys) return { outcome: 'LIMIT_REACHED', active } as const;
      const rows = await this.writer.query<{ api_key_id: string }>(
        `INSERT INTO operations.subscriber_api_key (subscriber_account_id, key_prefix, key_hash, label)
         VALUES (CAST(:subscriberAccountId AS uuid), :prefix, :hash, :label)
         RETURNING subscriber_api_key_id::text AS api_key_id`,
        {
          type: QueryTypes.SELECT,
          transaction,
          replacements: { subscriberAccountId, prefix: issued.prefix, hash: issued.hash, label },
        },
      );
      return { outcome: 'CREATED', apiKeyId: rows[0]!.api_key_id } as const;
    });
  }

  /** Revokes one key of one account; revoking twice keeps the first instant. */
  async revoke(subscriberAccountId: string, apiKeyId: string): Promise<boolean> {
    const rows = await this.writer.query<{ api_key_id: string }>(
      `UPDATE operations.subscriber_api_key
          SET revoked_at = COALESCE(revoked_at, now())
        WHERE subscriber_api_key_id = CAST(:apiKeyId AS uuid)
          AND subscriber_account_id = CAST(:subscriberAccountId AS uuid)
        RETURNING subscriber_api_key_id::text AS api_key_id`,
      { type: QueryTypes.SELECT, replacements: { subscriberAccountId, apiKeyId } },
    );
    return rows.length > 0;
  }

  /** Adds to this month's counter. Returns null when the account does not exist. */
  async increment(
    subscriberAccountId: string,
    usageKind: UsageKind,
    amount: number,
    transaction: Transaction | null = null,
  ): Promise<number | null> {
    const rows = await this.writer.query<{ used: number }>(INCREMENT, {
      type: QueryTypes.SELECT,
      transaction,
      replacements: { subscriberAccountId, usageKind, amount },
    });
    const row = rows[0];
    return row ? Number(row.used) : null;
  }

  /**
   * Resolves a presented key to its account and meters the call.
   *
   * In one transaction: find the key (unrevoked), mark it used, and add one to
   * this month's API counter — but only when the account is entitled. A lapsed
   * account's calls are refused by the site and must not eat into a quota the
   * customer will pay for later; its current figure is still returned so the
   * site can say how much was used. Returns null for an unknown or revoked key.
   */
  async verify(
    keyHash: string,
    usageKind: UsageKind,
    amount: number,
    now: Date = new Date(),
  ): Promise<KeyVerification | null> {
    return this.writer.transaction(async (transaction) => {
      const found = await this.writer.query<{ subscriber_account_id: string }>(
        `UPDATE operations.subscriber_api_key
            SET last_used_at = now()
          WHERE key_hash = :keyHash AND revoked_at IS NULL
          RETURNING subscriber_account_id::text AS subscriber_account_id`,
        { type: QueryTypes.SELECT, transaction, replacements: { keyHash } },
      );
      const key = found[0];
      if (!key) return null;
      const accounts = await this.writer.query<AccountRow>(
        `SELECT ${ACCOUNT_COLUMNS} FROM operations.subscriber_account
          WHERE subscriber_account_id = CAST(:subscriberAccountId AS uuid)`,
        {
          type: QueryTypes.SELECT,
          transaction,
          replacements: { subscriberAccountId: key.subscriber_account_id },
        },
      );
      const account = accounts[0];
      if (!account) return null;
      const entitled = isEntitled(effectiveStatus(account.status, account.paid_until, now));
      const used = entitled
        ? await this.increment(account.subscriber_account_id, usageKind, amount, transaction)
        : await this.currentCount(account.subscriber_account_id, usageKind, transaction);
      return { account, used: used ?? 0 };
    });
  }

  private async currentCount(
    subscriberAccountId: string,
    usageKind: UsageKind,
    transaction: Transaction,
  ): Promise<number> {
    const rows = await this.writer.query<{ used: number }>(
      `SELECT used FROM operations.subscriber_usage
        WHERE subscriber_account_id = CAST(:subscriberAccountId AS uuid)
          AND period_month = ${CURRENT_MONTH} AND usage_kind = :usageKind`,
      { type: QueryTypes.SELECT, transaction, replacements: { subscriberAccountId, usageKind } },
    );
    return rows[0] ? Number(rows[0].used) : 0;
  }
}
