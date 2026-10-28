import type { FastifyReply } from 'fastify';
import { NotFoundError } from '../../../common/errors/application.error';
import { SiteSubscriberCredentialsController } from '../site-subscriber-credentials.controller';
import { SubscriberAccountRepository } from '../subscriber-account.repository';
import { SubscriberAdminRepository } from '../subscriber-admin.repository';
import { SubscriberMemberRepository } from '../subscriber-member.repository';
import { SubscriberPaymentRepository } from '../subscriber-payment.repository';
import { SubscriberSessionRepository } from '../subscriber-session.repository';
import type { SubscriberSignInService } from '../subscriber-sign-in.service';
import { endOfLaPazDay, toAccountSummary } from '../subscription-account-row';
import { issueToken } from '../subscription-secrets';
import { accountUpdateSchema } from '../subscription.schemas';
import {
  ACCOUNT,
  MEMBER,
  fakeReply,
  fakeWriter,
  identity,
  type RecordedQuery,
} from './subscription-fixtures';

const ID = ACCOUNT.subscriber_account_id;
const MEMBER_ID = MEMBER.subscriber_member_id;

function statementsOn(calls: RecordedQuery[], table: string): RecordedQuery[] {
  return calls.filter((call) => call.sql.includes(table));
}

describe('payments only move paid_until forward', () => {
  it('keeps the later of the stored instant and the covered day', async () => {
    const { writer, calls } = fakeWriter((sql) =>
      sql.startsWith('UPDATE') ? [ACCOUNT] : [{ subscriber_payment_id: 'p-1' }],
    );
    const payments = new SubscriberPaymentRepository(writer);
    await payments.recordPayment(
      ID,
      { amountBob: 150, coversUntil: '2026-11-30', reference: null },
      endOfLaPazDay('2026-11-30'),
      'operator',
    );
    const [update] = calls;
    expect(update?.sql).toContain(
      'paid_until = GREATEST(paid_until, CAST(:paidUntil AS timestamptz))',
    );
    expect(update?.replacements).toMatchObject({ paidUntil: '2026-12-01T03:59:59.000Z' });
  });
});

describe('a new token spends the earlier unused ones', () => {
  const spendsThenInserts = (calls: RecordedQuery[], memberId: string | null) => {
    const tokens = statementsOn(calls, 'operations.subscriber_token');
    expect(tokens).toHaveLength(2);
    expect(tokens[0]?.sql).toMatch(/^UPDATE operations\.subscriber_token\s+SET used_at = now\(\)/u);
    expect(tokens[0]?.sql).toContain(
      'subscriber_member_id IS NOT DISTINCT FROM CAST(:subscriberMemberId AS uuid)',
    );
    expect(tokens[0]?.sql).toContain('AND purpose = :purpose');
    expect(tokens[0]?.sql).toContain('AND used_at IS NULL');
    expect(tokens[1]?.sql).toMatch(/^INSERT INTO operations\.subscriber_token/u);
    expect(tokens[0]?.replacements).toMatchObject({ subscriberMemberId: memberId });
  };

  it('for an operator-issued token, after locking the account row', async () => {
    const { writer, calls } = fakeWriter((sql) =>
      sql.includes('FOR UPDATE') ? [{ found: 1 }] : [],
    );
    const register = new SubscriberAdminRepository(writer);
    await expect(register.issueToken(ID, 'RESET', issueToken())).resolves.toBe(true);
    expect(calls[0]?.sql).toContain('FOR UPDATE');
    spendsThenInserts(calls, null);
    expect(calls.at(-1)?.replacements).toMatchObject({ purpose: 'RESET' });
  });

  it('for a self-service reset of a member, scoped to that member', async () => {
    const { writer, calls } = fakeWriter((sql) => {
      if (sql.includes('FROM operations.subscriber_member m')) {
        return [{ subscriber_account_id: ID, subscriber_member_id: MEMBER_ID, full_name: 'Luis' }];
      }
      return [];
    });
    const accounts = new SubscriberAccountRepository(writer);
    await expect(accounts.issueReset(MEMBER.email, issueToken())).resolves.toEqual({
      fullName: 'Luis',
      memberId: MEMBER_ID,
    });
    expect(calls[0]?.sql).toContain("status <> 'CANCELLED'");
    spendsThenInserts(calls, MEMBER_ID);
  });

  it('answers null, and stores nothing, for an e-mail nobody may reset', async () => {
    const { writer, calls } = fakeWriter(() => []);
    const accounts = new SubscriberAccountRepository(writer);
    await expect(accounts.issueReset('nadie@example.org', issueToken())).resolves.toBeNull();
    expect(statementsOn(calls, 'operations.subscriber_token')).toHaveLength(0);
  });
});

describe('session_version', () => {
  it('starts at 1 and travels in the account summary with the lock in force', () => {
    const lockedUntil = new Date(Date.now() + 60_000);
    expect(toAccountSummary(ACCOUNT)).toMatchObject({ sessionVersion: 1, lockedUntil: null });
    expect(
      toAccountSummary({ ...ACCOUNT, session_version: 4, locked_until: lockedUntil }),
    ).toMatchObject({
      sessionVersion: 4,
      lockedUntil: lockedUntil.toISOString(),
    });
    // A lock that has passed is not reported, though the instant is still stored.
    const past = { ...ACCOUNT, locked_until: new Date(Date.now() - 1000) };
    expect(toAccountSummary(past).lockedUntil).toBeNull();
  });

  it('rises when the owner changes its password', async () => {
    const { writer, calls } = fakeWriter(() => [{ subscriber_account_id: ID }]);
    await new SubscriberAccountRepository(writer).setPassword(ID, 'scrypt$hash');
    expect(calls[0]?.sql).toContain('session_version = session_version + 1');
  });

  it('rises, and the lock clears, when an owner token is spent', async () => {
    const { writer, calls } = fakeWriter((sql) =>
      sql.includes('subscriber_token')
        ? [{ subscriber_account_id: ID, subscriber_member_id: null }]
        : [ACCOUNT],
    );
    const spent = await new SubscriberAccountRepository(writer).activate('h'.repeat(64), 'x', 'v1');
    expect(spent?.member).toBeNull();
    const account = statementsOn(calls, 'UPDATE operations.subscriber_account')[0];
    expect(account?.sql).toContain('session_version = session_version + 1');
    expect(account?.sql).toContain('failed_login_count = 0, locked_until = NULL');
  });

  it("rises on the member's row, and the lock clears, when a member token is spent", async () => {
    const { writer, calls } = fakeWriter((sql) => {
      if (sql.includes('subscriber_token')) {
        return [{ subscriber_account_id: ID, subscriber_member_id: MEMBER_ID }];
      }
      return sql.includes('subscriber_member') ? [MEMBER] : [ACCOUNT];
    });
    const spent = await new SubscriberAccountRepository(writer).activate('h'.repeat(64), 'x', 'v1');
    expect(spent?.member?.subscriber_member_id).toBe(MEMBER_ID);
    const member = statementsOn(calls, 'UPDATE operations.subscriber_member')[0];
    expect(member?.sql).toContain('session_version = session_version + 1');
    expect(member?.sql).toContain('failed_login_count = 0, locked_until = NULL');
    // A removed member's token sets nothing.
    expect(member?.sql).toContain("status = 'ACTIVE'");
    expect(statementsOn(calls, 'UPDATE operations.subscriber_account')).toHaveLength(0);
  });

  it('rises for the owner alone on the site, and for owner and members on the console', async () => {
    const site = fakeWriter(() => [ACCOUNT]);
    await new SubscriberSessionRepository(site.writer).revoke(ID, false);
    expect(site.calls).toHaveLength(1);
    expect(site.calls[0]?.sql).toContain('session_version = session_version + 1');
    const consoleRevoke = fakeWriter(() => [ACCOUNT]);
    await new SubscriberSessionRepository(consoleRevoke.writer).revoke(ID, true);
    const members = statementsOn(consoleRevoke.calls, 'UPDATE operations.subscriber_member')[0];
    expect(members?.sql).toContain('session_version = session_version + 1');
    expect(members?.replacements).toMatchObject({ subscriberAccountId: ID });
  });

  it("rises on a member's password change and on its removal, not on a second removal", async () => {
    const password = fakeWriter(() => [{ subscriber_member_id: MEMBER_ID }]);
    await new SubscriberMemberRepository(password.writer).setPassword(ID, MEMBER_ID, 'scrypt$h');
    expect(password.calls[0]?.sql).toContain('session_version = session_version + 1');
    const removal = fakeWriter(() => [{ subscriber_member_id: MEMBER_ID }]);
    await new SubscriberMemberRepository(removal.writer).remove(ID, MEMBER_ID);
    expect(removal.calls[0]?.sql).toContain("+ CASE WHEN status = 'ACTIVE' THEN 1 ELSE 0 END");
    // Its unused tokens are spent with it.
    expect(removal.calls[1]?.sql).toContain('UPDATE operations.subscriber_token');
  });
});

describe('the operator clears a lock', () => {
  it('accepts unlock: true only, and clears count and lock in the same UPDATE', async () => {
    expect(accountUpdateSchema.safeParse({ unlock: false }).success).toBe(false);
    const change = accountUpdateSchema.parse({ unlock: true });
    const { writer, calls } = fakeWriter(() => [ACCOUNT]);
    await new SubscriberAdminRepository(writer).update(ID, change);
    expect(calls[0]?.sql).toContain('failed_login_count = CASE WHEN :unlock THEN 0');
    expect(calls[0]?.sql).toContain('locked_until = CASE WHEN :unlock THEN NULL');
    expect(calls[0]?.replacements).toMatchObject({ unlock: true });
    const untouched = fakeWriter(() => [ACCOUNT]);
    await new SubscriberAdminRepository(untouched.writer).update(ID, { status: 'ACTIVE' });
    expect(untouched.calls[0]?.replacements).toMatchObject({ unlock: false });
  });
});

describe('password resets', () => {
  function credentials(issueReset: jest.Mock) {
    return new SiteSubscriberCredentialsController(
      identity,
      { issueReset } as unknown as SubscriberAccountRepository,
      {} as SubscriberSessionRepository,
      {} as SubscriberSignInService,
    );
  }

  it('answers 201 with the token to whoever may reset, and 202 with nothing otherwise', async () => {
    const issueReset = jest
      .fn()
      .mockResolvedValueOnce({ fullName: 'Luis', memberId: MEMBER.subscriber_member_id })
      .mockResolvedValueOnce(null);
    const controller = credentials(issueReset);
    const issued = fakeReply();
    await controller.requestReset(
      { email: MEMBER.email },
      'r',
      issued.reply as unknown as FastifyReply,
    );
    expect(issued.sent.status).toBe(201);
    const data = (issued.sent.body as { data: Record<string, unknown> }).data;
    expect(data).toMatchObject({ fullName: 'Luis', memberId: MEMBER.subscriber_member_id });
    expect(typeof data.token).toBe('string');
    // Only the hash reached the repository.
    expect(JSON.stringify(issueReset.mock.calls[0])).not.toContain(String(data.token));
    const refused = fakeReply();
    await controller.requestReset(
      { email: 'x@example.org' },
      'r',
      refused.reply as unknown as FastifyReply,
    );
    expect(refused.sent).toMatchObject({ status: 202, body: { data: {} } });
  });

  it("ends the owner's sessions alone from the site, and answers 404 for an unknown account", async () => {
    const revoke = jest
      .fn()
      .mockResolvedValueOnce({ ...ACCOUNT, session_version: 5 })
      .mockResolvedValueOnce(null);
    const controller = new SiteSubscriberCredentialsController(
      identity,
      {} as SubscriberAccountRepository,
      { revoke } as unknown as SubscriberSessionRepository,
      {} as SubscriberSignInService,
    );
    const params = { subscriberAccountId: ACCOUNT.subscriber_account_id };
    const revoked = await controller.revokeSessions(params, 'r');
    expect(revoke).toHaveBeenCalledWith(ACCOUNT.subscriber_account_id, false);
    expect(revoked.data).toMatchObject({ account: { sessionVersion: 5 } });
    await expect(controller.revokeSessions(params, 'r')).rejects.toBeInstanceOf(NotFoundError);
  });
});
