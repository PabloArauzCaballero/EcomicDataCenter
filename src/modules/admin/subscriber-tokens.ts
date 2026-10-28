import { QueryTypes, type Sequelize, type Transaction } from 'sequelize';
import type { StoredToken } from './subscription-secrets';
import type { TokenPurpose } from './subscription.schemas';

/** Whose token it is: the owner's when `subscriberMemberId` is null. */
export interface TokenHolder {
  readonly subscriberAccountId: string;
  readonly subscriberMemberId: string | null;
}

/**
 * Stores a one-time token and spends every earlier unused one of the same
 * account, purpose and holder, so only the newest link works.
 *
 * Runs inside the caller's transaction, which must already hold the row lock
 * of the holder (the account, or the member): two concurrent issues then run
 * one after the other, and the second spends the first.
 */
export async function replaceToken(
  writer: Sequelize,
  transaction: Transaction,
  holder: TokenHolder,
  purpose: TokenPurpose,
  token: StoredToken,
): Promise<void> {
  const replacements = {
    subscriberAccountId: holder.subscriberAccountId,
    subscriberMemberId: holder.subscriberMemberId,
    purpose,
    hash: token.hash,
    expiresAt: token.expiresAt.toISOString(),
  };
  await writer.query(
    `UPDATE operations.subscriber_token
        SET used_at = now()
      WHERE subscriber_account_id = CAST(:subscriberAccountId AS uuid)
        AND subscriber_member_id IS NOT DISTINCT FROM CAST(:subscriberMemberId AS uuid)
        AND purpose = :purpose
        AND used_at IS NULL`,
    { type: QueryTypes.UPDATE, transaction, replacements },
  );
  await writer.query(
    `INSERT INTO operations.subscriber_token (
       token_hash, subscriber_account_id, subscriber_member_id, purpose, expires_at
     ) VALUES (
       :hash, CAST(:subscriberAccountId AS uuid), CAST(:subscriberMemberId AS uuid), :purpose,
       CAST(:expiresAt AS timestamptz)
     )`,
    { type: QueryTypes.INSERT, transaction, replacements },
  );
}

/** Spends every unused token of a member, whatever its purpose: it was removed. */
export async function spendMemberTokens(
  writer: Sequelize,
  transaction: Transaction,
  subscriberMemberId: string,
): Promise<void> {
  await writer.query(
    `UPDATE operations.subscriber_token
        SET used_at = now()
      WHERE subscriber_member_id = CAST(:subscriberMemberId AS uuid) AND used_at IS NULL`,
    { type: QueryTypes.UPDATE, transaction, replacements: { subscriberMemberId } },
  );
}

/**
 * Takes a transaction-scoped lock on an e-mail across owners and members.
 *
 * No constraint spans the two tables, so every path that gives an e-mail to an
 * owner or a member takes this lock before checking the other table: the check
 * and the insert then cannot interleave with another path's.
 */
export async function lockEmail(
  writer: Sequelize,
  transaction: Transaction,
  email: string,
): Promise<void> {
  await writer.query(`SELECT pg_advisory_xact_lock(hashtext('subscriber-email:' || :email))`, {
    type: QueryTypes.SELECT,
    transaction,
    replacements: { email },
  });
}
