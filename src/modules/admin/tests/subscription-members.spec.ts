import type { FastifyReply } from 'fastify';
import { NotFoundError } from '../../../common/errors/application.error';
import { SiteSubscriberMembersController } from '../site-subscriber-members.controller';
import { SiteSubscriberNoticesController } from '../site-subscriber-notices.controller';
import { SubscriberAdminRepository } from '../subscriber-admin.repository';
import { SubscriberMemberRepository } from '../subscriber-member.repository';
import { SubscriberNoticeRepository } from '../subscriber-notice.repository';
import { issueToken } from '../subscription-secrets';
import { memberCreationSchema, noticeClaimSchema } from '../subscription.schemas';
import { ACCOUNT, MEMBER, fakeReply, fakeWriter, identity } from './subscription-fixtures';

const ID = ACCOUNT.subscriber_account_id;
const INVITE = { email: 'luis@example.org', fullName: 'Luis Mamani', maxMembers: 2 };

/** Answers the seat count, the e-mail holders and the insert of `add`. */
function seatsWriter(active: number, holders: string[]) {
  return fakeWriter((sql) => {
    if (sql.includes('FOR UPDATE OF a')) return [{ active: String(active) }];
    if (sql.includes("'OWNER' AS holder")) return holders.map((holder) => ({ holder }));
    if (sql.startsWith('INSERT INTO operations.subscriber_member')) return [MEMBER];
    return [];
  });
}

describe('members: seats and e-mails', () => {
  it('adds a member with its activation token while a seat is free', async () => {
    const { writer, calls } = seatsWriter(1, []);
    const result = await new SubscriberMemberRepository(writer).add(ID, INVITE, issueToken());
    expect(result).toEqual({ outcome: 'CREATED', member: MEMBER });
    // The e-mail is locked before it is checked against owners and members.
    const lock = calls.findIndex((call) => call.sql.includes('pg_advisory_xact_lock'));
    const check = calls.findIndex((call) => call.sql.includes("'OWNER' AS holder"));
    expect(lock).toBeGreaterThan(0);
    expect(check).toBeGreaterThan(lock);
    const token = calls.find((call) =>
      call.sql.startsWith('INSERT INTO operations.subscriber_token'),
    );
    expect(token?.replacements).toMatchObject({
      purpose: 'ACTIVATE',
      subscriberMemberId: MEMBER.subscriber_member_id,
    });
  });

  it('refuses when ACTIVE members already fill maxMembers, counted under the row lock', async () => {
    const { writer, calls } = seatsWriter(2, []);
    const result = await new SubscriberMemberRepository(writer).add(ID, INVITE, issueToken());
    expect(result).toEqual({ outcome: 'LIMIT_REACHED', active: 2 });
    expect(calls[0]?.sql).toContain("m.status = 'ACTIVE'");
    expect(calls.some((call) => call.sql.startsWith('INSERT'))).toBe(false);
  });

  it.each([[['OWNER']], [['ACTIVE']], [['REMOVED', 'OWNER']]])(
    'refuses an e-mail already held by %j',
    async (holders) => {
      const { writer, calls } = seatsWriter(0, holders);
      const result = await new SubscriberMemberRepository(writer).add(ID, INVITE, issueToken());
      expect(result).toEqual({ outcome: 'EMAIL_IN_USE' });
      expect(calls.some((call) => call.sql.startsWith('INSERT'))).toBe(false);
    },
  );

  it('reinstates the row of a REMOVED member instead of colliding on the unique e-mail', async () => {
    const { writer, calls } = seatsWriter(0, ['REMOVED']);
    const result = await new SubscriberMemberRepository(writer).add(
      ID,
      { ...INVITE, maxMembers: 1 },
      issueToken(),
    );
    expect(result.outcome).toBe('CREATED');
    const insert = calls.find((call) =>
      call.sql.startsWith('INSERT INTO operations.subscriber_member'),
    );
    expect(insert?.sql).toContain("WHERE operations.subscriber_member.status = 'REMOVED'");
    expect(insert?.sql).toContain('password_hash = NULL');
  });

  it('answers 404 for an unknown account and 409 with the reason otherwise', async () => {
    const add = jest
      .fn()
      .mockResolvedValueOnce({ outcome: 'NO_ACCOUNT' })
      .mockResolvedValueOnce({ outcome: 'EMAIL_IN_USE' })
      .mockResolvedValueOnce({ outcome: 'LIMIT_REACHED', active: 2 })
      .mockResolvedValueOnce({ outcome: 'CREATED', member: MEMBER });
    const controller = new SiteSubscriberMembersController(identity, {
      add,
    } as unknown as SubscriberMemberRepository);
    const params = { subscriberAccountId: ID };
    await expect(controller.add(params, INVITE, 'r')).rejects.toBeInstanceOf(NotFoundError);
    await expect(controller.add(params, INVITE, 'r')).rejects.toMatchObject({
      statusCode: 409,
      details: { reason: 'EMAIL_IN_USE' },
    });
    await expect(controller.add(params, INVITE, 'r')).rejects.toMatchObject({
      statusCode: 409,
      details: { reason: 'LIMIT_REACHED', active: 2, maxMembers: 2 },
    });
    const created = await controller.add(params, INVITE, 'r');
    expect(created.data).toMatchObject({
      member: { memberId: MEMBER.subscriber_member_id, activated: true, sessionVersion: 3 },
    });
    const data = created.data as { activationToken: string };
    // The repository received the token's hash only, never the token.
    expect(JSON.stringify(add.mock.calls[3])).not.toContain(data.activationToken);
  });

  it('lowercases the e-mail and accepts zero seats', () => {
    const parsed = memberCreationSchema.parse({
      ...INVITE,
      email: ' Luis@Example.ORG ',
      maxMembers: 0,
    });
    expect(parsed.email).toBe('luis@example.org');
    expect(memberCreationSchema.safeParse({ ...INVITE, maxMembers: -1 }).success).toBe(false);
  });

  it('refuses to open an owner account on an e-mail an ACTIVE member holds', async () => {
    const { writer, calls } = fakeWriter((sql) =>
      sql.includes('FROM operations.subscriber_member') ? [{ found: 1 }] : [],
    );
    const created = await new SubscriberAdminRepository(writer).create(
      {
        email: MEMBER.email,
        fullName: 'Luis',
        organization: null,
        planCode: 'analista',
        billingPeriod: 'MONTHLY',
        trialDays: 0,
        serviceInquiryId: null,
      },
      'PENDING',
      null,
      issueToken(),
    );
    expect(created).toBeNull();
    expect(calls[0]?.sql).toContain('pg_advisory_xact_lock');
    expect(calls.some((call) => call.sql.startsWith('INSERT'))).toBe(false);
  });
});

describe('notices are claimed once', () => {
  function controllerWith(claim: jest.Mock) {
    return new SiteSubscriberNoticesController(identity, {
      claim,
    } as unknown as SubscriberNoticeRepository);
  }
  const CLAIM = { subscriberAccountId: ID, kind: 'USAGE_80' as const, periodKey: '2026-10' };

  it('answers 201 claimed:true first and 200 claimed:false on a repeat', async () => {
    const controller = controllerWith(
      jest.fn().mockResolvedValueOnce('CLAIMED').mockResolvedValueOnce('ALREADY_CLAIMED'),
    );
    const first = fakeReply();
    await controller.claim(CLAIM, 'r', first.reply as unknown as FastifyReply);
    expect(first.sent).toMatchObject({ status: 201, body: { data: { claimed: true } } });
    const again = fakeReply();
    await controller.claim(CLAIM, 'r', again.reply as unknown as FastifyReply);
    expect(again.sent).toMatchObject({ status: 200, body: { data: { claimed: false } } });
  });

  it('answers 404 for an unknown account', async () => {
    const controller = controllerWith(jest.fn().mockResolvedValue('NO_ACCOUNT'));
    const { reply } = fakeReply();
    await expect(
      controller.claim(CLAIM, 'r', reply as unknown as FastifyReply),
    ).rejects.toBeInstanceOf(NotFoundError);
  });

  it('lets the unique key decide, in one statement', async () => {
    const { writer, calls } = fakeWriter(() => [{ found: true, claimed: false }]);
    await expect(new SubscriberNoticeRepository(writer).claim(CLAIM)).resolves.toBe(
      'ALREADY_CLAIMED',
    );
    expect(calls).toHaveLength(1);
    expect(calls[0]?.sql).toContain(
      'ON CONFLICT (subscriber_account_id, kind, period_key) DO NOTHING',
    );
  });

  it('takes YYYY-MM for usage and the paidUntil day for expiry and grace', () => {
    const valid = (kind: string, periodKey: string) =>
      noticeClaimSchema.safeParse({ subscriberAccountId: ID, kind, periodKey }).success;
    expect(valid('USAGE_80', '2026-10')).toBe(true);
    expect(valid('USAGE_80', '2026-10-31')).toBe(false);
    expect(valid('EXPIRY_5D', '2026-11-30')).toBe(true);
    expect(valid('GRACE', '2026-11-30T23:59:59.000Z')).toBe(true);
    expect(valid('GRACE', '2026-11')).toBe(false);
    expect(valid('OTHER', '2026-11')).toBe(false);
  });

  it('lists every account but PENDING and CANCELLED, with four usage kinds', async () => {
    const { writer, calls } = fakeWriter((sql) =>
      sql.includes('AS members') ? [{ ...ACCOUNT, members: 2 }] : [],
    );
    const [candidate] = await new SubscriberNoticeRepository(writer).candidates();
    expect(calls[0]?.sql).toContain("NOT IN ('CANCELLED', 'PENDING')");
    expect(candidate?.members).toBe(2);
    expect(candidate?.usage.map((row) => row.usageKind)).toEqual([
      'API',
      'DOWNLOAD',
      'CHAT',
      'MAP',
    ]);
  });
});
