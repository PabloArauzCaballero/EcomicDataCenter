import { Inject, Injectable } from '@nestjs/common';
import { QueryTypes, type Sequelize, type Transaction } from 'sequelize';
import { WRITER_DATABASE } from '../../database/database.tokens';
import {
  ACCOUNT_COLUMNS,
  CURRENT_MONTH,
  type AccountRow,
  type UsageCount,
} from './subscription-account-row';
import { replaceToken } from './subscriber-tokens';
import { MEMBER_COLUMNS, type MemberRow } from './subscription-member-row';
import type { StoredToken } from './subscription-secrets';
import { USAGE_KINDS, type UsageKind } from './subscription.schemas';

/** Whoever a spent token named: the owner (member null) or one of its members. */
export interface Activated {
  readonly account: AccountRow;
  readonly member: MemberRow | null;
}

/** Who a self-service reset token was issued to; `memberId` null for the owner. */
export interface ResetHolder {
  /** The address as stored, which is where the link must be sent. */
  readonly email: string;
  readonly fullName: string;
  readonly memberId: string | null;
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

  async findById(
    subscriberAccountId: string,
    transaction: Transaction | null = null,
  ): Promise<AccountRow | null> {
    const rows = await this.writer.query<AccountRow>(
      `SELECT ${ACCOUNT_COLUMNS} FROM operations.subscriber_account
        WHERE subscriber_account_id = CAST(:subscriberAccountId AS uuid)`,
      { type: QueryTypes.SELECT, transaction, replacements: { subscriberAccountId } },
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

  /**
   * Replaces the password hash and raises `session_version`, so every other
   * session of the owner ends. Returns false when the account does not exist.
   */
  async setPassword(subscriberAccountId: string, passwordHash: string): Promise<boolean> {
    const rows = await this.writer.query<{ subscriber_account_id: string }>(
      `UPDATE operations.subscriber_account
          SET password_hash = :passwordHash, session_version = session_version + 1,
              updated_at = now()
        WHERE subscriber_account_id = CAST(:subscriberAccountId AS uuid)
        RETURNING subscriber_account_id::text AS subscriber_account_id`,
      { type: QueryTypes.SELECT, replacements: { subscriberAccountId, passwordHash } },
    );
    return rows.length > 0;
  }

  /**
   * Issues a RESET token for whoever signs in with this e-mail: an owner whose
   * account is not CANCELLED, or else an ACTIVE member of such an account.
   *
   * The holder's row is locked first and its earlier unused RESET tokens are
   * spent, so only the newest link works. Returns null when the e-mail names
   * nobody who may reset — the caller answers alike either way.
   */
  async issueReset(email: string, token: StoredToken): Promise<ResetHolder | null> {
    return this.writer.transaction(async (transaction) => {
      const owners = await this.writer.query<{
        subscriber_account_id: string;
        email: string;
        full_name: string;
      }>(
        `SELECT subscriber_account_id::text AS subscriber_account_id, email, full_name
           FROM operations.subscriber_account
          WHERE email = :email AND status <> 'CANCELLED'
          FOR UPDATE`,
        { type: QueryTypes.SELECT, transaction, replacements: { email } },
      );
      const members = owners[0]
        ? []
        : await this.writer.query<{
            subscriber_account_id: string;
            subscriber_member_id: string;
            email: string;
            full_name: string;
          }>(
            `SELECT m.subscriber_account_id::text AS subscriber_account_id,
                    m.subscriber_member_id::text AS subscriber_member_id, m.email, m.full_name
               FROM operations.subscriber_member m
               JOIN operations.subscriber_account a
                 ON a.subscriber_account_id = m.subscriber_account_id
              WHERE m.email = :email AND m.status = 'ACTIVE' AND a.status <> 'CANCELLED'
              FOR UPDATE OF m`,
            { type: QueryTypes.SELECT, transaction, replacements: { email } },
          );
      const holder = owners[0]
        ? { ...owners[0], subscriber_member_id: null }
        : (members[0] ?? null);
      if (!holder) return null;
      await replaceToken(
        this.writer,
        transaction,
        {
          subscriberAccountId: holder.subscriber_account_id,
          subscriberMemberId: holder.subscriber_member_id,
        },
        'RESET',
        token,
      );
      return {
        email: holder.email,
        fullName: holder.full_name,
        memberId: holder.subscriber_member_id,
      };
    });
  }

  /**
   * Spends a one-time token and sets the password of whoever it names.
   *
   * The token is consumed by a conditional UPDATE — unused and unexpired, in one
   * statement — so two concurrent activations with the same token cannot both
   * succeed. Spending it raises the holder's `session_version` and clears its
   * sign-in lock and failure count. An owner's token also records the terms it
   * accepted; the status is left as the operator set it, because activation
   * proves the customer owns the e-mail, it does not grant a plan. A member's
   * token works only while the member is ACTIVE.
   *
   * Returns null when the token is unknown, expired, already used, or names a
   * member that was removed.
   */
  async activate(
    tokenHash: string,
    passwordHash: string,
    termsVersion: string,
  ): Promise<Activated | null> {
    return this.writer.transaction(async (transaction) => {
      const spent = await this.writer.query<{
        subscriber_account_id: string;
        subscriber_member_id: string | null;
      }>(
        `UPDATE operations.subscriber_token
            SET used_at = now()
          WHERE token_hash = :tokenHash AND used_at IS NULL AND expires_at > now()
          RETURNING subscriber_account_id::text AS subscriber_account_id,
                    subscriber_member_id::text AS subscriber_member_id`,
        { type: QueryTypes.SELECT, transaction, replacements: { tokenHash } },
      );
      const holder = spent[0];
      if (!holder) return null;
      const subscriberAccountId = holder.subscriber_account_id;
      if (holder.subscriber_member_id) {
        const members = await this.writer.query<MemberRow>(
          `UPDATE operations.subscriber_member
              SET password_hash = :passwordHash, session_version = session_version + 1,
                  failed_login_count = 0, locked_until = NULL
            WHERE subscriber_member_id = CAST(:subscriberMemberId AS uuid) AND status = 'ACTIVE'
            RETURNING ${MEMBER_COLUMNS}`,
          {
            type: QueryTypes.SELECT,
            transaction,
            replacements: { subscriberMemberId: holder.subscriber_member_id, passwordHash },
          },
        );
        const member = members[0];
        if (!member) return null;
        const account = await this.findById(subscriberAccountId, transaction);
        return account ? { account, member } : null;
      }
      const rows = await this.writer.query<AccountRow>(
        `UPDATE operations.subscriber_account
            SET password_hash = :passwordHash, terms_version = :termsVersion,
                terms_accepted_at = now(), session_version = session_version + 1,
                failed_login_count = 0, locked_until = NULL, updated_at = now()
          WHERE subscriber_account_id = CAST(:subscriberAccountId AS uuid)
          RETURNING ${ACCOUNT_COLUMNS}`,
        {
          type: QueryTypes.SELECT,
          transaction,
          replacements: { subscriberAccountId, passwordHash, termsVersion },
        },
      );
      const account = rows[0];
      return account ? { account, member: null } : null;
    });
  }
}
