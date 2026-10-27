import { ForbiddenException } from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import type { Actor, ActorRole } from '../../../common/auth/actor';
import { REQUIRED_ROLES } from '../../../common/auth/auth.decorators';
import { RolesGuard } from '../../../common/auth/roles.guard';
import { ConflictError, NotFoundError } from '../../../common/errors/application.error';
import { AdminSubscriptionsController } from '../admin-subscriptions.controller';
import type { DeploymentIdentity } from '../deployment-identity';
import {
  InvalidCredentialsError,
  SiteSubscriptionsController,
} from '../site-subscriptions.controller';
import type { SubscriberAccountRepository } from '../subscriber-account.repository';
import type { SubscriberAdminRepository } from '../subscriber-admin.repository';
import type { SubscriberKeyRepository } from '../subscriber-key.repository';
import type { AccountRow } from '../subscription-account-row';
import { hashPassword } from '../subscription-secrets';

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

describe.each([
  ['site', SiteSubscriptionsController, 'SITE_SUBSCRIPTIONS', 'SUBSCRIPTION_ADMIN'],
  ['admin', AdminSubscriptionsController, 'SUBSCRIPTION_ADMIN', 'SITE_SUBSCRIPTIONS'],
] as const)('%s subscription routes: who may call what', (_name, controller, owner, sibling) => {
  const handlers = handlersOf(controller);

  it('declares exactly one role on every route', () => {
    expect(handlers.length).toBeGreaterThan(0);
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
});

const ACCOUNT: AccountRow = {
  subscriber_account_id: '9a7c2f10-1b2c-4d3e-8f40-5a6b7c8d9e0f',
  email: 'ana@example.org',
  full_name: 'Ana Quispe',
  organization: null,
  legal_name: null,
  tax_id: null,
  plan_code: 'analista',
  billing_period: 'MONTHLY',
  status: 'ACTIVE',
  paid_until: new Date(Date.now() + 86_400_000),
  created_at: new Date('2026-10-01T00:00:00Z'),
  created_at_key: '2026-10-01T00:00:00.000000Z',
};
const identity = { environmentId: 'test' } as DeploymentIdentity;

function siteController(
  accounts: Partial<SubscriberAccountRepository>,
  keys: Partial<SubscriberKeyRepository> = {},
) {
  return new SiteSubscriptionsController(
    identity,
    accounts as SubscriberAccountRepository,
    keys as SubscriberKeyRepository,
  );
}

describe('site subscription routes: behaviour', () => {
  it('signs in with the right password and answers the account summary', async () => {
    const passwordHash = await hashPassword('una-clave-larga');
    const controller = siteController({
      findCredentialsByEmail: jest.fn().mockResolvedValue({ account: ACCOUNT, passwordHash }),
    });
    const answer = await controller.signIn(
      { email: 'ana@example.org', password: 'una-clave-larga' },
      'req-1',
    );
    expect(answer.data).toMatchObject({ account: { email: 'ana@example.org', entitled: true } });
  });

  it('gives the same 401 for an unknown e-mail, a wrong password and no password', async () => {
    const passwordHash = await hashPassword('una-clave-larga');
    const cases = [
      null,
      { account: ACCOUNT, passwordHash },
      { account: ACCOUNT, passwordHash: null },
    ];
    for (const found of cases) {
      const controller = siteController({
        findCredentialsByEmail: jest.fn().mockResolvedValue(found),
      });
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
    const controller = siteController({}, { create });
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
    const controller = siteController({}, { verify: jest.fn().mockResolvedValue(null) });
    await expect(
      controller.verifyKey({ keyHash: 'a'.repeat(64), usageKind: 'API', amount: 1 }, 'r'),
    ).rejects.toBeInstanceOf(NotFoundError);
  });

  it('answers 400 for a spent or unknown activation token', async () => {
    const controller = siteController({ activate: jest.fn().mockResolvedValue(null) });
    await expect(
      controller.activate(
        { token: 't'.repeat(43), password: 'una-clave-larga', termsVersion: 'v1' },
        'r',
      ),
    ).rejects.toMatchObject({ statusCode: 400 });
  });
});

describe('admin subscription routes: behaviour', () => {
  it('opens a trial with paid_until and an activation token, and 409 on a taken e-mail', async () => {
    const create = jest
      .fn()
      .mockResolvedValueOnce({ ...ACCOUNT, status: 'TRIAL' })
      .mockResolvedValueOnce(null);
    const controller = new AdminSubscriptionsController(identity, {
      create,
    } as unknown as SubscriberAdminRepository);
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
    const [, status, paidUntil] = create.mock.calls[0] as [unknown, string, Date];
    expect(status).toBe('TRIAL');
    expect(Math.round((paidUntil.getTime() - Date.now()) / 86_400_000)).toBe(14);
    expect(answer.data).toMatchObject({ activationToken: expect.any(String) });
    await expect(controller.create({ ...body, trialDays: 0 }, 'r')).rejects.toBeInstanceOf(
      ConflictError,
    );
    expect(create.mock.calls[1]?.[1]).toBe('PENDING');
  });
});
