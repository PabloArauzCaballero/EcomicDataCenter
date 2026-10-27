import { Inject, Injectable } from '@nestjs/common';
import { QueryTypes, type Sequelize } from 'sequelize';
import { WRITER_DATABASE } from '../../database/database.tokens';
import {
  ACCOUNT_COLUMNS,
  CURRENT_MONTH,
  type AccountRow,
  type UsageCount,
} from './subscription-account-row';
import { USAGE_KINDS, type UsageKind } from './subscription.schemas';

export interface AccountCredentials {
  readonly account: AccountRow;
  readonly passwordHash: string | null;
}

export interface ApiKeyRow {
  readonly api_key_id: string;
  readonly key_prefix: string;
  readonly label: string;
  readonly created_at: Date;
  readonly last_used_at: Date | null;
  readonly revoked_at: Date | null;
}

/**
 * Reads and changes one subscriber's own account: the customer area's register.
 *
 * Every read goes through the writer. The reader credential has no grant on
 * these tables — an account row carries a password hash — and the customer
 * area reads back what it has just written, which a replica could lag behind.
 *
 * Nothing here logs. E-mails, password hashes and token hashes never leave
 * this class except as the values the caller asked for.
 */
@Injectable()
export class SubscriberAccountRepository {
  constructor(@Inject(WRITER_DATABASE) private readonly writer: Sequelize) {}

  async findCredentialsByEmail(email: string): Promise<AccountCredentials | null> {
    const rows = await this.writer.query<AccountRow & { password_hash: string | null }>(
      `SELECT ${ACCOUNT_COLUMNS}, password_hash
         FROM operations.subscriber_account
        WHERE email = :email`,
      { type: QueryTypes.SELECT, replacements: { email } },
    );
    const row = rows[0];
    if (!row) return null;
    const { password_hash: passwordHash, ...account } = row;
    return { account, passwordHash };
  }

  async findPasswordHash(subscriberAccountId: string): Promise<{ hash: string | null } | null> {
    const rows = await this.writer.query<{ password_hash: string | null }>(
      `SELECT password_hash FROM operations.subscriber_account
        WHERE subscriber_account_id = CAST(:subscriberAccountId AS uuid)`,
      { type: QueryTypes.SELECT, replacements: { subscriberAccountId } },
    );
    const row = rows[0];
    return row ? { hash: row.password_hash } : null;
  }

  async findById(subscriberAccountId: string): Promise<AccountRow | null> {
    const rows = await this.writer.query<AccountRow>(
      `SELECT ${ACCOUNT_COLUMNS} FROM operations.subscriber_account
        WHERE subscriber_account_id = CAST(:subscriberAccountId AS uuid)`,
      { type: QueryTypes.SELECT, replacements: { subscriberAccountId } },
    );
    return rows[0] ?? null;
  }

  /** This month's counters, every kind present and zero when nothing was used. */
  async currentUsage(subscriberAccountId: string): Promise<UsageCount[]> {
    const rows = await this.writer.query<{ usage_kind: UsageKind; used: number }>(
      `SELECT usage_kind, used FROM operations.subscriber_usage
        WHERE subscriber_account_id = CAST(:subscriberAccountId AS uuid)
          AND period_month = ${CURRENT_MONTH}`,
      { type: QueryTypes.SELECT, replacements: { subscriberAccountId } },
    );
    const used = new Map(rows.map((row) => [row.usage_kind, Number(row.used)]));
    return USAGE_KINDS.map((usageKind) => ({ usageKind, used: used.get(usageKind) ?? 0 }));
  }

  async listApiKeys(subscriberAccountId: string): Promise<ApiKeyRow[]> {
    return this.writer.query<ApiKeyRow>(
      `SELECT subscriber_api_key_id::text AS api_key_id, key_prefix, label,
              created_at, last_used_at, revoked_at
         FROM operations.subscriber_api_key
        WHERE subscriber_account_id = CAST(:subscriberAccountId AS uuid)
        ORDER BY created_at DESC, subscriber_api_key_id DESC`,
      { type: QueryTypes.SELECT, replacements: { subscriberAccountId } },
    );
  }

  /** Replaces the password hash. Returns false when the account does not exist. */
  async setPassword(subscriberAccountId: string, passwordHash: string): Promise<boolean> {
    const rows = await this.writer.query<{ subscriber_account_id: string }>(
      `UPDATE operations.subscriber_account
          SET password_hash = :passwordHash, updated_at = now()
        WHERE subscriber_account_id = CAST(:subscriberAccountId AS uuid)
        RETURNING subscriber_account_id::text AS subscriber_account_id`,
      { type: QueryTypes.SELECT, replacements: { subscriberAccountId, passwordHash } },
    );
    return rows.length > 0;
  }

  /**
   * Spends a one-time token and sets the password and the terms it accepted.
   *
   * The token is consumed by a conditional UPDATE — unused and unexpired, in one
   * statement — so two concurrent activations with the same token cannot both
   * succeed. The status is left as the operator set it: activation proves the
   * customer owns the e-mail, it does not grant a plan. Returns null when the
   * token is unknown, expired or already used.
   */
  async activate(
    tokenHash: string,
    passwordHash: string,
    termsVersion: string,
  ): Promise<AccountRow | null> {
    return this.writer.transaction(async (transaction) => {
      const spent = await this.writer.query<{ subscriber_account_id: string }>(
        `UPDATE operations.subscriber_token
            SET used_at = now()
          WHERE token_hash = :tokenHash AND used_at IS NULL AND expires_at > now()
          RETURNING subscriber_account_id::text AS subscriber_account_id`,
        { type: QueryTypes.SELECT, transaction, replacements: { tokenHash } },
      );
      const owner = spent[0];
      if (!owner) return null;
      const rows = await this.writer.query<AccountRow>(
        `UPDATE operations.subscriber_account
            SET password_hash = :passwordHash, terms_version = :termsVersion,
                terms_accepted_at = now(), updated_at = now()
          WHERE subscriber_account_id = CAST(:subscriberAccountId AS uuid)
          RETURNING ${ACCOUNT_COLUMNS}`,
        {
          type: QueryTypes.SELECT,
          transaction,
          replacements: {
            subscriberAccountId: owner.subscriber_account_id,
            passwordHash,
            termsVersion,
          },
        },
      );
      return rows[0] ?? null;
    });
  }
}
