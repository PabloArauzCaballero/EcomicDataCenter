import { ForbiddenException } from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import type { Actor, ActorRole } from '../../../common/auth/actor';
import { REQUIRED_ROLES } from '../../../common/auth/auth.decorators';
import { RolesGuard } from '../../../common/auth/roles.guard';
import { ConflictError, NotFoundError } from '../../../common/errors/application.error';
import { AdminSubscriptionsController } from '../admin-subscriptions.controller';
import { SiteSubscriberCredentialsController } from '../site-subscriber-credentials.controller';
import { SiteSubscriberMembersController } from '../site-subscriber-members.controller';
import { SiteSubscriberNoticesController } from '../site-subscriber-notices.controller';
import { SiteSubscriptionsController } from '../site-subscriptions.controller';
import type { SubscriberAccountRepository } from '../subscriber-account.repository';
import type { SubscriberAdminRepository } from '../subscriber-admin.repository';
import type { SubscriberKeyRepository } from '../subscriber-key.repository';
import type { SubscriberMemberRepository } from '../subscriber-member.repository';
import type { SubscriberPaymentRepository } from '../subscriber-payment.repository';
import type { SubscriberSessionRepository } from '../subscriber-session.repository';
import { SubscriberSignInService } from '../subscriber-sign-in.service';
import type { AccountRow } from '../subscription-account-row';
import { InvalidCredentialsError } from '../subscription-errors';
import { hashPassword } from '../subscription-secrets';
import { ACCOUNT, MEMBER, identity } from './subscription-fixtures';

type Handler = (...args: never[]) => unknown;

const guard = new RolesGuard(new Reflector());
const OTHER_ROLES: ActorRole[] = [
  'ANALYST',
  'METHODOLOGY_STEWARD',
  'SEED_OPERATOR',
  'DATA_OFFICER',
  'DATA_REVIEWER',
  'SITE_TELEMETRY',
  'SITE_INQUIRY',
];

function handlersOf(controller: { prototype: object }): Array<[string, Handler]> {
  const prototype = controller.prototype as Record<string, unknown>;
  return Object.getOwnPropertyNames(prototype)
    .filter((name) => name !== 'constructor')
    .map((name) => [name, prototype[name] as Handler]);
}

function contextFor(handler: Handler, actor: Actor | undefined) {
  return {
    getHandler: () => handler,
    getClass: () => class {},
    switchToHttp: () => ({ getRequest: () => ({ actor }) }),
  } as unknown as Parameters<RolesGuard['canActivate']>[0];
}

const actorWith = (role: ActorRole): Actor => ({ subject: `subject-${role}`, roles: [role] });
const SITE = 'SITE_SUBSCRIPTIONS';
const ADMIN = 'SUBSCRIPTION_ADMIN';

describe.each([
  ['site', SiteSubscriptionsController, SITE, ADMIN, 7],
  ['site credentials', SiteSubscriberCredentialsController, SITE, ADMIN, 4],
  ['site members', SiteSubscriberMembersController, SITE, ADMIN, 5],
  ['site notices', SiteSubscriberNoticesController, SITE, ADMIN, 3],
  ['admin', AdminSubscriptionsController, ADMIN, SITE, 8],
] as const)(
  '%s subscription routes: who may call what',
  (_name, controller, owner, sibling, count) => {
    const handlers = handlersOf(controller);

    it('declares exactly one role on every route', () => {
      // The count pins the routes, so a new one cannot slip in untested.
      expect(handlers).toHaveLength(count);
      for (const [, handler] of handlers) {
        expect(Reflect.getMetadata(REQUIRED_ROLES, handler)).toEqual([owner]);
      }
    });

    it('admits its own role and refuses every other, including the sibling', () => {
      for (const [, handler] of handlers) {
        expect(guard.canActivate(contextFor(handler, actorWith(owner)))).toBe(true);
        for (const role of [...OTHER_ROLES, sibling]) {
          expect(() => guard.canActivate(contextFor(handler, actorWith(role)))).toThrow(
            ForbiddenException,
          );
        }
        expect(() => guard.canActivate(contextFor(handler, undefined))).toThrow(ForbiddenException);
      }
    });
  },
);

function siteController(
  keys: Partial<SubscriberKeyRepository> = {},
  sessions: Partial<SubscriberSessionRepository> = {},
) {
  return new SiteSubscriptionsController(
    identity,
    {} as SubscriberAccountRepository,
    {} as SubscriberAdminRepository,
    keys as SubscriberKeyRepository,
    new SubscriberSignInService(sessions as SubscriberSessionRepository),
  );
}

/** A sign-in lookup that finds `principal` and is never locked. */
function sessionsFinding(principal: unknown): Partial<SubscriberSessionRepository> {
  return {
    findPrincipal: jest.fn().mockResolvedValue(principal),
    recordFailure: jest.fn().mockResolvedValue(null),
    recordSuccess: jest.fn().mockResolvedValue(true),
  };
}

describe('site subscription routes: behaviour', () => {
  it('signs in an owner with member null, and a member with its own version', async () => {
    const passwordHash = await hashPassword('una-clave-larga');
    const owner = { kind: 'OWNER', id: 'o', account: ACCOUNT, member: null, passwordHash };
    const asOwner = await siteController({}, sessionsFinding(owner)).signIn(
      { email: 'ana@example.org', password: 'una-clave-larga' },
      'req-1',
    );
    expect(asOwner.data).toMatchObject({
      account: { email: 'ana@example.org', entitled: true, sessionVersion: 1, lockedUntil: null },
      member: null,
    });
    const member = { kind: 'MEMBER', id: 'm', account: ACCOUNT, member: MEMBER, passwordHash };
    const asMember = await siteController({}, sessionsFinding(member)).signIn(
      { email: MEMBER.email, password: 'una-clave-larga' },
      'req-2',
    );
    expect(asMember.data).toMatchObject({
      account: { subscriberAccountId: ACCOUNT.subscriber_account_id },
      member: {
        memberId: MEMBER.subscriber_member_id,
        email: MEMBER.email,
        fullName: MEMBER.full_name,
        sessionVersion: 3,
      },
    });
  });

  it('gives the same 401 for an unknown e-mail, a wrong password and no password', async () => {
    const passwordHash = await hashPassword('una-clave-larga');
    const owner = { kind: 'OWNER', id: 'o', account: ACCOUNT, member: null };
    const cases = [null, { ...owner, passwordHash }, { ...owner, passwordHash: null }];
    for (const found of cases) {
      const controller = siteController({}, sessionsFinding(found));
      const attempt = controller.signIn({ email: 'x@example.org', password: 'otra-clave-xx' }, 'r');
      await expect(attempt).rejects.toBeInstanceOf(InvalidCredentialsError);
      await expect(attempt).rejects.toMatchObject({
        statusCode: 401,
        message: 'Invalid e-mail or password',
      });
    }
  });

  it('returns a new key once and answers 409 at the limit', async () => {
    const create = jest
      .fn()
      .mockResolvedValueOnce({ outcome: 'CREATED', apiKeyId: 'k-1' })
      .mockResolvedValueOnce({ outcome: 'LIMIT_REACHED', active: 1 });
    const controller = siteController({ create });
    const params = { subscriberAccountId: ACCOUNT.subscriber_account_id };
    const created = await controller.createKey(params, { label: 'x', maxActiveKeys: 1 }, 'r');
    const data = created.data as { key: string; prefix: string };
    expect(data.key).toMatch(/^obs_live_/u);
    expect(data.prefix).toBe(data.key.slice(0, 16));
    // The repository received the hash, never the key itself.
    expect(JSON.stringify(create.mock.calls[0])).not.toContain(data.key);
    await expect(
      controller.createKey(params, { label: 'y', maxActiveKeys: 1 }, 'r'),
    ).rejects.toBeInstanceOf(ConflictError);
  });

  it('answers 404 for an unknown or revoked key', async () => {
    const controller = siteController({ verify: jest.fn().mockResolvedValue(null) });
    await expect(
      controller.verifyKey({ keyHash: 'a'.repeat(64), usageKind: 'API', amount: 1 }, 'r'),
    ).rejects.toBeInstanceOf(NotFoundError);
  });

  it('answers 400 for a spent or unknown activation token', async () => {
    const controller = new SiteSubscriberCredentialsController(
      identity,
      { activate: jest.fn().mockResolvedValue(null) } as unknown as SubscriberAccountRepository,
      {} as SubscriberSessionRepository,
      {} as SubscriberSignInService,
    );
    await expect(
      controller.activate(
        { token: 't'.repeat(43), password: 'una-clave-larga', termsVersion: 'v1' },
        'r',
      ),
    ).rejects.toMatchObject({ statusCode: 400 });
  });

  it('answers activation with the same {account, member} shape as sign-in', async () => {
    const activate = jest
      .fn()
      .mockResolvedValueOnce({ account: ACCOUNT, member: null })
      .mockResolvedValueOnce({ account: { ...ACCOUNT, session_version: 2 }, member: MEMBER });
    const controller = new SiteSubscriberCredentialsController(
      identity,
      { activate } as unknown as SubscriberAccountRepository,
      {} as SubscriberSessionRepository,
      {} as SubscriberSignInService,
    );
    const body = { token: 't'.repeat(43), password: 'una-clave-larga', termsVersion: 'v1' };
    const owner = await controller.activate(body, 'r');
    expect(owner.data).toMatchObject({ account: { sessionVersion: 1 }, member: null });
    const member = await controller.activate(body, 'r');
    expect(member.data).toMatchObject({
      account: { sessionVersion: 2 },
      member: {
        memberId: MEMBER.subscriber_member_id,
        email: MEMBER.email,
        fullName: MEMBER.full_name,
        sessionVersion: 3,
      },
    });
    // Only the token's hash reaches the repository.
    expect(JSON.stringify(activate.mock.calls)).not.toContain(body.token);
  });
});

function adminController(register: Partial<SubscriberAdminRepository>) {
  return new AdminSubscriptionsController(
    identity,
    register as SubscriberAdminRepository,
    {} as SubscriberPaymentRepository,
    {} as SubscriberSessionRepository,
    {} as SubscriberMemberRepository,
  );
}

describe('admin subscription routes: behaviour', () => {
  it('opens a trial with paid_until and an activation token, and 409 on a taken e-mail', async () => {
    const create = jest
      .fn<Promise<AccountRow | null>, Parameters<SubscriberAdminRepository['create']>>()
      .mockResolvedValueOnce({ ...ACCOUNT, status: 'TRIAL' })
      .mockResolvedValueOnce(null);
    const controller = adminController({ create });
    const body = {
      email: 'ana@example.org',
      fullName: 'Ana',
      organization: null,
      planCode: 'analista' as const,
      billingPeriod: 'MONTHLY' as const,
      trialDays: 14,
      serviceInquiryId: null,
    };
    const answer = await controller.create(body, 'r');
    const [, status, paidUntil] = create.mock.calls[0]!;
    expect(status).toBe('TRIAL');
    expect(Math.round((paidUntil!.getTime() - Date.now()) / 86_400_000)).toBe(14);
    expect(typeof (answer.data as { activationToken: unknown }).activationToken).toBe('string');
    await expect(controller.create({ ...body, trialDays: 0 }, 'r')).rejects.toBeInstanceOf(
      ConflictError,
    );
    expect(create.mock.calls[1]?.[1]).toBe('PENDING');
  });

  it('revokes the sessions of the owner and its members, and lists the members', async () => {
    const revoke = jest.fn().mockResolvedValue({ ...ACCOUNT, session_version: 2 });
    const list = jest.fn().mockResolvedValueOnce([MEMBER]).mockResolvedValueOnce(null);
    const controller = new AdminSubscriptionsController(
      identity,
      {} as SubscriberAdminRepository,
      {} as SubscriberPaymentRepository,
      { revoke } as unknown as SubscriberSessionRepository,
      { list } as unknown as SubscriberMemberRepository,
    );
    const params = { subscriberAccountId: ACCOUNT.subscriber_account_id };
    const revoked = await controller.revokeSessions(params, 'r');
    expect(revoke).toHaveBeenCalledWith(ACCOUNT.subscriber_account_id, true);
    expect(revoked.data).toMatchObject({ account: { sessionVersion: 2 } });
    const members = await controller.listMembers(params, 'r');
    expect(members.data).toMatchObject({ items: [{ memberId: MEMBER.subscriber_member_id }] });
    await expect(controller.listMembers(params, 'r')).rejects.toBeInstanceOf(NotFoundError);
  });
});
