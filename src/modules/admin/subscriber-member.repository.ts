import { Inject, Injectable } from '@nestjs/common';
import { QueryTypes, type Sequelize, type Transaction } from 'sequelize';
import { WRITER_DATABASE } from '../../database/database.tokens';
import { lockEmail, replaceToken, spendMemberTokens } from './subscriber-tokens';
import { MEMBER_COLUMNS, type MemberRow } from './subscription-member-row';
import type { StoredToken } from './subscription-secrets';
import type { MemberCreation } from './subscription.schemas';

export type MemberAddition =
  | { readonly outcome: 'CREATED'; readonly member: MemberRow }
  | { readonly outcome: 'NO_ACCOUNT' }
  | { readonly outcome: 'EMAIL_IN_USE' }
  | { readonly outcome: 'LIMIT_REACHED'; readonly active: number };

const BY_ACCOUNT_AND_MEMBER = `subscriber_account_id = CAST(:subscriberAccountId AS uuid)
          AND subscriber_member_id = CAST(:memberId AS uuid)`;

/**
 * The people an owner lets into its plan.
 *
 * A member signs in with its own e-mail and password, under its own lock and
 * session version, and sees the owner's account. The owner counts as one user
 * of the plan; how many members the plan allows is the site's figure, passed
 * in, and checked under the account's row lock so two invitations cannot both
 * take the last seat. Nothing here logs.
 */
@Injectable()
export class SubscriberMemberRepository {
  constructor(@Inject(WRITER_DATABASE) private readonly writer: Sequelize) {}

  /** Every member of an account, oldest first; null when the account is unknown. */
  async list(subscriberAccountId: string): Promise<MemberRow[] | null> {
    const accounts = await this.writer.query<{ found: number }>(
      `SELECT 1 AS found FROM operations.subscriber_account
        WHERE subscriber_account_id = CAST(:subscriberAccountId AS uuid)`,
      { type: QueryTypes.SELECT, replacements: { subscriberAccountId } },
    );
    if (accounts.length === 0) return null;
    return this.writer.query<MemberRow>(
      `SELECT ${MEMBER_COLUMNS} FROM operations.subscriber_member
        WHERE subscriber_account_id = CAST(:subscriberAccountId AS uuid)
        ORDER BY created_at, subscriber_member_id`,
      { type: QueryTypes.SELECT, replacements: { subscriberAccountId } },
    );
  }

  async find(subscriberAccountId: string, memberId: string): Promise<MemberRow | null> {
    const rows = await this.writer.query<MemberRow>(
      `SELECT ${MEMBER_COLUMNS} FROM operations.subscriber_member WHERE ${BY_ACCOUNT_AND_MEMBER}`,
      { type: QueryTypes.SELECT, replacements: { subscriberAccountId, memberId } },
    );
    return rows[0] ?? null;
  }

  /**
   * Adds a member and its activation token, or explains why not.
   *
   * In one transaction: lock the account row (the seat count), lock the e-mail
   * (the owner check), refuse an e-mail that names an owner or any member still
   * ACTIVE, refuse when `maxMembers` ACTIVE members already exist, then insert.
   * An e-mail that names a REMOVED member reuses that row — the column is
   * unique and the writer cannot delete — as a fresh membership: moved to this
   * account, password cleared, session version raised, lock cleared.
   */
  async add(
    subscriberAccountId: string,
    input: MemberCreation,
    token: StoredToken,
  ): Promise<MemberAddition> {
    return this.writer.transaction(async (transaction) => {
      const seats = await this.writer.query<{ active: string }>(
        `SELECT (SELECT COUNT(*) FROM operations.subscriber_member m
                  WHERE m.subscriber_account_id = a.subscriber_account_id
                    AND m.status = 'ACTIVE')::text AS active
           FROM operations.subscriber_account a
          WHERE a.subscriber_account_id = CAST(:subscriberAccountId AS uuid)
          FOR UPDATE OF a`,
        { type: QueryTypes.SELECT, transaction, replacements: { subscriberAccountId } },
      );
      const account = seats[0];
      if (!account) return { outcome: 'NO_ACCOUNT' } as const;
      await lockEmail(this.writer, transaction, input.email);
      const taken = await this.writer.query<{ holder: string }>(
        `SELECT 'OWNER' AS holder FROM operations.subscriber_account WHERE email = :email
         UNION ALL
         SELECT status AS holder FROM operations.subscriber_member WHERE email = :email`,
        { type: QueryTypes.SELECT, transaction, replacements: { email: input.email } },
      );
      if (taken.some((row) => row.holder !== 'REMOVED'))
        return { outcome: 'EMAIL_IN_USE' } as const;
      const active = Number(account.active);
      if (active >= input.maxMembers) return { outcome: 'LIMIT_REACHED', active } as const;
      const member = await this.upsert(subscriberAccountId, input, transaction);
      await replaceToken(
        this.writer,
        transaction,
        { subscriberAccountId, subscriberMemberId: member.subscriber_member_id },
        'ACTIVATE',
        token,
      );
      return { outcome: 'CREATED', member } as const;
    });
  }

  /** Inserts the member, or reinstates the REMOVED row that holds its e-mail. */
  private async upsert(
    subscriberAccountId: string,
    input: MemberCreation,
    transaction: Transaction,
  ): Promise<MemberRow> {
    const rows = await this.writer.query<MemberRow>(
      `INSERT INTO operations.subscriber_member (subscriber_account_id, email, full_name)
       VALUES (CAST(:subscriberAccountId AS uuid), :email, :fullName)
       ON CONFLICT (email) DO UPDATE
          SET subscriber_account_id = EXCLUDED.subscriber_account_id,
              full_name = EXCLUDED.full_name, status = 'ACTIVE', password_hash = NULL,
              session_version = operations.subscriber_member.session_version + 1,
              failed_login_count = 0, locked_until = NULL, created_at = now()
        WHERE operations.subscriber_member.status = 'REMOVED'
       RETURNING ${MEMBER_COLUMNS}`,
      {
        type: QueryTypes.SELECT,
        transaction,
        replacements: { subscriberAccountId, email: input.email, fullName: input.fullName },
      },
    );
    // The e-mail lock and the check above leave only an insert or a REMOVED row.
    return rows[0]!;
  }

  /**
   * Removes a member: status REMOVED, its session version raised so its open
   * sessions end, and its unused tokens spent. Removing twice changes nothing
   * more. Returns false when the account has no such member.
   */
  async remove(subscriberAccountId: string, memberId: string): Promise<boolean> {
    return this.writer.transaction(async (transaction) => {
      const rows = await this.writer.query<{ subscriber_member_id: string }>(
        `UPDATE operations.subscriber_member
            SET session_version = session_version
                                  + CASE WHEN status = 'ACTIVE' THEN 1 ELSE 0 END,
                status = 'REMOVED'
          WHERE ${BY_ACCOUNT_AND_MEMBER}
          RETURNING subscriber_member_id::text AS subscriber_member_id`,
        { type: QueryTypes.SELECT, transaction, replacements: { subscriberAccountId, memberId } },
      );
      if (rows.length === 0) return false;
      await spendMemberTokens(this.writer, transaction, memberId);
      return true;
    });
  }

  /** The password hash of an ACTIVE member; null when there is no such member. */
  async findPasswordHash(
    subscriberAccountId: string,
    memberId: string,
  ): Promise<{ hash: string | null } | null> {
    const rows = await this.writer.query<{ password_hash: string | null }>(
      `SELECT password_hash FROM operations.subscriber_member
        WHERE ${BY_ACCOUNT_AND_MEMBER} AND status = 'ACTIVE'`,
      { type: QueryTypes.SELECT, replacements: { subscriberAccountId, memberId } },
    );
    const row = rows[0];
    return row ? { hash: row.password_hash } : null;
  }

  /** Replaces an ACTIVE member's password and ends its other sessions. */
  async setPassword(
    subscriberAccountId: string,
    memberId: string,
    passwordHash: string,
  ): Promise<boolean> {
    const rows = await this.writer.query<{ subscriber_member_id: string }>(
      `UPDATE operations.subscriber_member
          SET password_hash = :passwordHash, session_version = session_version + 1
        WHERE ${BY_ACCOUNT_AND_MEMBER} AND status = 'ACTIVE'
        RETURNING subscriber_member_id::text AS subscriber_member_id`,
      {
        type: QueryTypes.SELECT,
        replacements: { subscriberAccountId, memberId, passwordHash },
      },
    );
    return rows.length > 0;
  }
}
