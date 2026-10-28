import { Inject, Injectable } from '@nestjs/common';
import { QueryTypes, type Sequelize } from 'sequelize';
import { WRITER_DATABASE } from '../../database/database.tokens';
import { ACCOUNT_COLUMNS, type AccountRow } from './subscription-account-row';
import { MEMBER_COLUMNS, type MemberRow } from './subscription-member-row';

/** Consecutive failed sign-ins that lock a principal, and for how long. */
export const SIGN_IN_FAILURE_LIMIT = 10;
export const SIGN_IN_LOCK_MINUTES = 15;

export type PrincipalKind = 'OWNER' | 'MEMBER';

/**
 * The table and key of each kind of principal. Only these fixed identifiers are
 * ever interpolated into SQL; every value travels as a replacement.
 */
const PRINCIPAL_TABLES: Readonly<Record<PrincipalKind, { table: string; key: string }>> = {
  OWNER: { table: 'operations.subscriber_account', key: 'subscriber_account_id' },
  MEMBER: { table: 'operations.subscriber_member', key: 'subscriber_member_id' },
};

/** Seconds left on a lock, measured by the database clock; null when unlocked. */
const RETRY_AFTER = `CASE WHEN locked_until > now()
  THEN CEIL(EXTRACT(EPOCH FROM (locked_until - now())))::int END AS retry_after_seconds`;

export interface Principal {
  readonly kind: PrincipalKind;
  readonly id: string;
  readonly account: AccountRow;
  readonly member: MemberRow | null;
  readonly passwordHash: string | null;
  /** Seconds until the lock ends, or null when the principal is not locked. */
  readonly retryAfterSeconds: number | null;
}

interface LockState {
  readonly retry_after_seconds: number | null;
}

/**
 * Who is signing in, and the lock that guards them.
 *
 * An owner is found by the account's e-mail; failing that, an ACTIVE member by
 * its own. Each keeps its own failure count and lock. Every change to them is a
 * single conditional UPDATE, so concurrent attempts are serialized by the row
 * lock and none can lose a failure, skip the lock or clear one just set.
 * Nothing here logs.
 */
@Injectable()
export class SubscriberSessionRepository {
  constructor(@Inject(WRITER_DATABASE) private readonly writer: Sequelize) {}

  async findPrincipal(email: string): Promise<Principal | null> {
    const owners = await this.writer.query<
      AccountRow & LockState & { password_hash: string | null }
    >(
      `SELECT ${ACCOUNT_COLUMNS}, password_hash, ${RETRY_AFTER}
         FROM operations.subscriber_account
        WHERE email = :email`,
      { type: QueryTypes.SELECT, replacements: { email } },
    );
    const owner = owners[0];
    if (owner) {
      const { password_hash: passwordHash, retry_after_seconds: retry, ...account } = owner;
      return {
        kind: 'OWNER',
        id: account.subscriber_account_id,
        account,
        member: null,
        passwordHash,
        retryAfterSeconds: retry === null ? null : Number(retry),
      };
    }
    return this.findMember(email);
  }

  private async findMember(email: string): Promise<Principal | null> {
    const members = await this.writer.query<
      MemberRow & LockState & { password_hash: string | null }
    >(
      `SELECT ${MEMBER_COLUMNS}, password_hash, ${RETRY_AFTER}
         FROM operations.subscriber_member
        WHERE email = :email AND status = 'ACTIVE'`,
      { type: QueryTypes.SELECT, replacements: { email } },
    );
    const found = members[0];
    if (!found) return null;
    const { password_hash: passwordHash, retry_after_seconds: retry, ...member } = found;
    const accounts = await this.writer.query<AccountRow>(
      `SELECT ${ACCOUNT_COLUMNS} FROM operations.subscriber_account
        WHERE subscriber_account_id = CAST(:subscriberAccountId AS uuid)`,
      {
        type: QueryTypes.SELECT,
        replacements: { subscriberAccountId: member.subscriber_account_id },
      },
    );
    const account = accounts[0];
    if (!account) return null;
    return {
      kind: 'MEMBER',
      id: member.subscriber_member_id,
      account,
      member,
      passwordHash,
      retryAfterSeconds: retry === null ? null : Number(retry),
    };
  }

  /**
   * Counts one failed sign-in. The tenth in a row locks the principal for
   * fifteen minutes and resets the count, in the same statement.
   *
   * A principal already locked is not counted again. Returns the seconds left
   * on the lock when the principal is locked after this attempt, else null.
   */
  async recordFailure(kind: PrincipalKind, id: string): Promise<number | null> {
    const { table, key } = PRINCIPAL_TABLES[kind];
    const rows = await this.writer.query<LockState>(
      `UPDATE ${table}
          SET failed_login_count = CASE WHEN failed_login_count + 1 >= :limit THEN 0
                                        ELSE failed_login_count + 1 END,
              locked_until = CASE WHEN failed_login_count + 1 >= :limit
                                  THEN now() + make_interval(mins => :minutes)
                                  ELSE NULL END
        WHERE ${key} = CAST(:id AS uuid)
          AND (locked_until IS NULL OR locked_until <= now())
        RETURNING ${RETRY_AFTER}`,
      {
        type: QueryTypes.SELECT,
        replacements: { id, limit: SIGN_IN_FAILURE_LIMIT, minutes: SIGN_IN_LOCK_MINUTES },
      },
    );
    const row = rows[0];
    if (row) return row.retry_after_seconds === null ? null : Number(row.retry_after_seconds);
    return this.currentLock(kind, id);
  }

  /**
   * Resets the failure count after a right password — unless a lock was set
   * meanwhile by concurrent failures, in which case the lock wins. Returns the
   * seconds left on that lock, or null when the sign-in may proceed.
   */
  async recordSuccess(kind: PrincipalKind, id: string): Promise<number | null> {
    const { table, key } = PRINCIPAL_TABLES[kind];
    const rows = await this.writer.query<{ cleared: boolean }>(
      `UPDATE ${table}
          SET failed_login_count = 0, locked_until = NULL
        WHERE ${key} = CAST(:id AS uuid)
          AND (locked_until IS NULL OR locked_until <= now())
        RETURNING true AS cleared`,
      { type: QueryTypes.SELECT, replacements: { id } },
    );
    if (rows.length > 0) return null;
    // Nothing cleared: the row is locked, or it vanished — which no path allows.
    return (await this.currentLock(kind, id)) ?? SIGN_IN_LOCK_MINUTES * 60;
  }

  /**
   * Ends every session the site issued for an account by raising its
   * `session_version`; with `members`, those of all its members as well, in the
   * same transaction. Returns the account as it now stands, or null if unknown.
   */
  async revoke(subscriberAccountId: string, members: boolean): Promise<AccountRow | null> {
    return this.writer.transaction(async (transaction) => {
      const rows = await this.writer.query<AccountRow>(
        `UPDATE operations.subscriber_account
            SET session_version = session_version + 1, updated_at = now()
          WHERE subscriber_account_id = CAST(:subscriberAccountId AS uuid)
          RETURNING ${ACCOUNT_COLUMNS}`,
        { type: QueryTypes.SELECT, transaction, replacements: { subscriberAccountId } },
      );
      const account = rows[0];
      if (!account || !members) return account ?? null;
      await this.writer.query(
        `UPDATE operations.subscriber_member
            SET session_version = session_version + 1
          WHERE subscriber_account_id = CAST(:subscriberAccountId AS uuid)`,
        { type: QueryTypes.UPDATE, transaction, replacements: { subscriberAccountId } },
      );
      return account;
    });
  }

  private async currentLock(kind: PrincipalKind, id: string): Promise<number | null> {
    const { table, key } = PRINCIPAL_TABLES[kind];
    const rows = await this.writer.query<LockState>(
      `SELECT ${RETRY_AFTER} FROM ${table} WHERE ${key} = CAST(:id AS uuid)`,
      { type: QueryTypes.SELECT, replacements: { id } },
    );
    const value = rows[0]?.retry_after_seconds;
    return value === null || value === undefined ? null : Number(value);
  }
}
