import { Inject, Injectable } from '@nestjs/common';
import { QueryTypes, type Sequelize } from 'sequelize';
import { WRITER_DATABASE } from '../../database/database.tokens';
import { ACCOUNT_COLUMNS, CURRENT_MONTH, type AccountRow } from './subscription-account-row';
import { USAGE_KINDS, type NoticeClaim, type UsageKind } from './subscription.schemas';

/** States whose accounts never get a notice: not yet opened, or closed. */
const SILENT_STATUSES = `('CANCELLED', 'PENDING')`;

export interface NoticeCandidate {
  readonly account: AccountRow;
  readonly usage: ReadonlyArray<{ readonly usageKind: UsageKind; readonly used: number }>;
  readonly members: number;
}

export type NoticeClaimOutcome = 'CLAIMED' | 'ALREADY_CLAIMED' | 'NO_ACCOUNT';

/**
 * What the site needs to send usage and expiry notices, and the ledger that
 * makes each notice go out once.
 *
 * The site decides which notice is due from the candidates; before sending it
 * claims the (account, kind, period) row. The unique key decides the claim in
 * one statement, so two runs of the site's cron cannot both send. Nothing here
 * logs.
 */
@Injectable()
export class SubscriberNoticeRepository {
  constructor(@Inject(WRITER_DATABASE) private readonly writer: Sequelize) {}

  /** Every account that may get a notice, with this month's usage and its ACTIVE members. */
  async candidates(): Promise<NoticeCandidate[]> {
    const accounts = await this.writer.query<AccountRow & { members: number }>(
      `SELECT ${ACCOUNT_COLUMNS},
              (SELECT COUNT(*) FROM operations.subscriber_member m
                WHERE m.subscriber_account_id = subscriber_account.subscriber_account_id
                  AND m.status = 'ACTIVE')::int AS members
         FROM operations.subscriber_account
        WHERE status NOT IN ${SILENT_STATUSES}
        ORDER BY created_at, subscriber_account_id`,
      { type: QueryTypes.SELECT },
    );
    const counts = await this.writer.query<{
      subscriber_account_id: string;
      usage_kind: UsageKind;
      used: number;
    }>(
      `SELECT u.subscriber_account_id::text AS subscriber_account_id, u.usage_kind, u.used
         FROM operations.subscriber_usage u
         JOIN operations.subscriber_account a
           ON a.subscriber_account_id = u.subscriber_account_id
        WHERE u.period_month = ${CURRENT_MONTH} AND a.status NOT IN ${SILENT_STATUSES}`,
      { type: QueryTypes.SELECT },
    );
    const usage = new Map<string, Map<UsageKind, number>>();
    for (const row of counts) {
      const byKind = usage.get(row.subscriber_account_id) ?? new Map<UsageKind, number>();
      byKind.set(row.usage_kind, Number(row.used));
      usage.set(row.subscriber_account_id, byKind);
    }
    return accounts.map(({ members, ...account }) => {
      const byKind = usage.get(account.subscriber_account_id);
      return {
        account,
        members: Number(members),
        usage: USAGE_KINDS.map((usageKind) => ({ usageKind, used: byKind?.get(usageKind) ?? 0 })),
      };
    });
  }

  /**
   * Claims one notice. The insert and the account check are one statement:
   * `DO NOTHING` on the unique key answers a repeated claim, and an unknown
   * account inserts nothing and says so.
   */
  async claim(claim: NoticeClaim): Promise<NoticeClaimOutcome> {
    const rows = await this.writer.query<{ found: boolean; claimed: boolean }>(
      `WITH account AS (
         SELECT subscriber_account_id FROM operations.subscriber_account
          WHERE subscriber_account_id = CAST(:subscriberAccountId AS uuid)
       ), claimed AS (
         INSERT INTO operations.subscriber_notice (subscriber_account_id, kind, period_key)
         SELECT subscriber_account_id, :kind, :periodKey FROM account
         ON CONFLICT (subscriber_account_id, kind, period_key) DO NOTHING
         RETURNING subscriber_notice_id
       )
       SELECT EXISTS (SELECT 1 FROM account) AS found,
              EXISTS (SELECT 1 FROM claimed) AS claimed`,
      {
        type: QueryTypes.SELECT,
        replacements: {
          subscriberAccountId: claim.subscriberAccountId,
          kind: claim.kind,
          periodKey: claim.periodKey,
        },
      },
    );
    const row = rows[0];
    if (!row?.found) return 'NO_ACCOUNT';
    return row.claimed ? 'CLAIMED' : 'ALREADY_CLAIMED';
  }
}
