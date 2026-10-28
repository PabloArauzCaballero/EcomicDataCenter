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

/** Whether a lock is in force, by the database clock. */
const LOCKED = `COALESCE(locked_until > now(), false) AS locked`;

export interface Principal {
  readonly kind: PrincipalKind;
  readonly id: string;
  readonly account: AccountRow;
  readonly member: MemberRow | null;
  readonly passwordHash: string | null;
  /** Whether a sign-in lock is in force now. */
  readonly locked: boolean;
}

interface LockState {
  readonly locked: boolean;
}

/** A principal already identified by the site, as a password change names it. */
export interface PrincipalRef {
  readonly kind: PrincipalKind;
  readonly subscriberAccountId: string;
  /** The member's id; null for the owner. */
  readonly memberId: string | null;
}

/** What checking a password needs: the hash and the lock in force, if any. */
export interface Credentials {
  readonly kind: PrincipalKind;
  readonly id: string;
  readonly passwordHash: string | null;
  readonly locked: boolean;
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
      `SELECT ${ACCOUNT_COLUMNS}, password_hash, ${LOCKED}
         FROM operations.subscriber_account
        WHERE email = :email`,
      { type: QueryTypes.SELECT, replacements: { email } },
    );
    const owner = owners[0];
    if (owner) {
      const { password_hash: passwordHash, locked, ...account } = owner;
      return {
        kind: 'OWNER',
        id: account.subscriber_account_id,
        account,
        member: null,
        passwordHash,
        locked: Boolean(locked),
      };
    }
    return this.findMember(email);
  }

  private async findMember(email: string): Promise<Principal | null> {
    const members = await this.writer.query<
      MemberRow & LockState & { password_hash: string | null }
    >(
      `SELECT ${MEMBER_COLUMNS}, password_hash, ${LOCKED}
         FROM operations.subscriber_member
        WHERE email = :email AND status = 'ACTIVE'`,
      { type: QueryTypes.SELECT, replacements: { email } },
    );
    const found = members[0];
    if (!found) return null;
    const { password_hash: passwordHash, locked, ...member } = found;
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
      locked: Boolean(locked),
    };
  }

  /**
   * Counts one failed sign-in. The tenth in a row locks the principal for
   * fifteen minutes and resets the count, in the same statement. A principal
   * already locked is not counted again, so guessing never extends a lock.
   */
  async recordFailure(kind: PrincipalKind, id: string): Promise<void> {
    const { table, key } = PRINCIPAL_TABLES[kind];
    await this.writer.query(
      `UPDATE ${table}
          SET failed_login_count = CASE WHEN failed_login_count + 1 >= :limit THEN 0
                                        ELSE failed_login_count + 1 END,
              locked_until = CASE WHEN failed_login_count + 1 >= :limit
                                  THEN now() + make_interval(mins => :minutes)
                                  ELSE NULL END
        WHERE ${key} = CAST(:id AS uuid)
          AND (locked_until IS NULL OR locked_until <= now())`,
      {
        type: QueryTypes.UPDATE,
        replacements: { id, limit: SIGN_IN_FAILURE_LIMIT, minutes: SIGN_IN_LOCK_MINUTES },
      },
    );
  }

  /**
   * Resets the failure count after a right password — unless a lock was set
   * meanwhile by concurrent failures, in which case the lock wins. Returns
   * whether the sign-in may proceed.
   */
  async recordSuccess(kind: PrincipalKind, id: string): Promise<boolean> {
    const { table, key } = PRINCIPAL_TABLES[kind];
    const rows = await this.writer.query<{ cleared: boolean }>(
      `UPDATE ${table}
          SET failed_login_count = 0, locked_until = NULL
        WHERE ${key} = CAST(:id AS uuid)
          AND (locked_until IS NULL OR locked_until <= now())
        RETURNING true AS cleared`,
      { type: QueryTypes.SELECT, replacements: { id } },
    );
    // Nothing cleared means the row is locked (or gone, which no path allows).
    return rows.length > 0;
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

  /**
   * The hash and lock of an owner, or of an ACTIVE member of that account.
   * Null when there is no such principal.
   */
  async findCredentials(target: PrincipalRef): Promise<Credentials | null> {
    const rows = await this.writer.query<LockState & { id: string; password_hash: string | null }>(
      target.kind === 'MEMBER'
        ? `SELECT subscriber_member_id::text AS id, password_hash, ${LOCKED}
             FROM operations.subscriber_member
            WHERE subscriber_account_id = CAST(:subscriberAccountId AS uuid)
              AND subscriber_member_id = CAST(:memberId AS uuid) AND status = 'ACTIVE'`
        : `SELECT subscriber_account_id::text AS id, password_hash, ${LOCKED}
             FROM operations.subscriber_account
            WHERE subscriber_account_id = CAST(:subscriberAccountId AS uuid)`,
      {
        type: QueryTypes.SELECT,
        replacements: {
          subscriberAccountId: target.subscriberAccountId,
          memberId: target.memberId,
        },
      },
    );
    const row = rows[0];
    if (!row) return null;
    return {
      kind: target.kind,
      id: row.id,
      passwordHash: row.password_hash,
      locked: Boolean(row.locked),
    };
  }
}
