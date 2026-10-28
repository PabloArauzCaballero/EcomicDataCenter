import { HttpExceptionFilter } from '../../../common/errors/http-exception.filter';
import {
  SIGN_IN_FAILURE_LIMIT,
  SIGN_IN_LOCK_MINUTES,
  SubscriberSessionRepository,
  type Principal,
  type PrincipalKind,
} from '../subscriber-session.repository';
import { SubscriberSignInService } from '../subscriber-sign-in.service';
import { InvalidCredentialsError } from '../subscription-errors';
import * as secrets from '../subscription-secrets';
import { ACCOUNT, fakeWriter } from './subscription-fixtures';

const PASSWORD = 'una-clave-larga';
const WRONG = 'otra-clave-xx';

/**
 * The lock as the database keeps it, in memory: the same rule the repository's
 * single UPDATE applies, so the service can be driven through a real sequence.
 */
class LockingSessions {
  failures = 0;
  lockedUntil: number | null = null;
  successes = 0;
  constructor(
    private readonly principal: Principal,
    private now: number,
  ) {}

  advance(ms: number): void {
    this.now += ms;
  }

  private locked(): boolean {
    return this.lockedUntil !== null && this.lockedUntil > this.now;
  }

  findPrincipal(): Promise<Principal> {
    return Promise.resolve({ ...this.principal, locked: this.locked() });
  }

  recordFailure(): Promise<void> {
    if (this.locked()) return Promise.resolve();
    this.failures += 1;
    if (this.failures >= SIGN_IN_FAILURE_LIMIT) {
      this.failures = 0;
      this.lockedUntil = this.now + SIGN_IN_LOCK_MINUTES * 60_000;
    } else this.lockedUntil = null;
    return Promise.resolve();
  }

  recordSuccess(): Promise<boolean> {
    if (this.locked()) return Promise.resolve(false);
    this.successes += 1;
    this.failures = 0;
    this.lockedUntil = null;
    return Promise.resolve(true);
  }

  /** What a token or the operator does: clear the lock and the count. */
  unlock(): void {
    this.failures = 0;
    this.lockedUntil = null;
  }
}

async function ownerPrincipal(): Promise<Principal> {
  return {
    kind: 'OWNER',
    id: ACCOUNT.subscriber_account_id,
    account: ACCOUNT,
    member: null,
    passwordHash: await secrets.hashPassword(PASSWORD),
    locked: false,
  };
}

async function lockedOwner(): Promise<{
  sessions: LockingSessions;
  service: SubscriberSignInService;
}> {
  const sessions = new LockingSessions(await ownerPrincipal(), Date.now());
  const service = new SubscriberSignInService(sessions as unknown as SubscriberSessionRepository);
  for (let attempt = 0; attempt < SIGN_IN_FAILURE_LIMIT; attempt += 1) {
    await service.signIn(ACCOUNT.email, WRONG).catch(() => undefined);
  }
  return { sessions, service };
}

/** The body the exception filter would send for an error, without the request id. */
function bodyOf(error: unknown): unknown {
  let sent: unknown;
  const reply = { status: () => ({ send: (body: unknown) => (sent = body) }) };
  const host = {
    switchToHttp: () => ({
      getResponse: () => reply,
      getRequest: () => ({ id: 'r', url: '/' }),
    }),
  };
  new HttpExceptionFilter({ error: jest.fn() } as never).catch(error, host as never);
  return sent;
}

async function rejection(attempt: Promise<unknown>): Promise<unknown> {
  return attempt.then(
    () => {
      throw new Error('expected a refusal');
    },
    (error: unknown) => error,
  );
}

describe('sign-in lock', () => {
  it('locks on the tenth consecutive failure, which still answers the generic 401', async () => {
    const sessions = new LockingSessions(await ownerPrincipal(), Date.now());
    const service = new SubscriberSignInService(sessions as unknown as SubscriberSessionRepository);
    for (let attempt = 1; attempt <= SIGN_IN_FAILURE_LIMIT; attempt += 1) {
      await expect(service.signIn(ACCOUNT.email, WRONG)).rejects.toBeInstanceOf(
        InvalidCredentialsError,
      );
    }
    expect(sessions.failures).toBe(0);
    expect(sessions.lockedUntil).not.toBeNull();
  });

  it('while locked, refuses the right password with the same 401 body as a wrong one', async () => {
    const { sessions, service } = await lockedOwner();
    const lockedUntil = sessions.lockedUntil;
    const recordFailure = jest.spyOn(sessions, 'recordFailure');
    const right = await rejection(service.signIn(ACCOUNT.email, PASSWORD));
    const wrong = await rejection(service.signIn(ACCOUNT.email, WRONG));
    const unknown = await rejection(
      new SubscriberSignInService({
        findPrincipal: jest.fn().mockResolvedValue(null),
      } as unknown as SubscriberSessionRepository).signIn('nadie@example.org', PASSWORD),
    );
    for (const error of [right, wrong, unknown]) {
      expect(error).toBeInstanceOf(InvalidCredentialsError);
      expect(error).toMatchObject({ statusCode: 401 });
    }
    // Byte for byte the same answer: nothing tells a locked account apart.
    expect(bodyOf(right)).toEqual(bodyOf(unknown));
    expect(bodyOf(wrong)).toEqual(bodyOf(unknown));
    // Neither attempt is counted, the lock is not extended, nothing is reset.
    expect(recordFailure).not.toHaveBeenCalled();
    expect(sessions.successes).toBe(0);
    expect(sessions.lockedUntil).toBe(lockedUntil);
  });

  it('runs scrypt while locked, so the refusal costs the same time', async () => {
    const { service } = await lockedOwner();
    const verify = jest.spyOn(secrets, 'verifyPassword');
    await service.signIn(ACCOUNT.email, PASSWORD).catch(() => undefined);
    expect(verify).toHaveBeenCalledTimes(1);
    verify.mockRestore();
  });

  it('lets the right password in once the lock has passed', async () => {
    const { sessions, service } = await lockedOwner();
    sessions.advance(SIGN_IN_LOCK_MINUTES * 60_000 + 1);
    await expect(service.signIn(ACCOUNT.email, PASSWORD)).resolves.toMatchObject({
      kind: 'OWNER',
    });
  });

  it('opens again at once when a token or the operator clears the lock', async () => {
    const { sessions, service } = await lockedOwner();
    sessions.unlock();
    await expect(service.signIn(ACCOUNT.email, PASSWORD)).resolves.toMatchObject({
      kind: 'OWNER',
    });
  });

  it('resets the count on a right password, so failures must be consecutive', async () => {
    const sessions = new LockingSessions(await ownerPrincipal(), Date.now());
    const service = new SubscriberSignInService(sessions as unknown as SubscriberSessionRepository);
    for (let attempt = 1; attempt < SIGN_IN_FAILURE_LIMIT; attempt += 1) {
      await service.signIn(ACCOUNT.email, WRONG).catch(() => undefined);
    }
    await service.signIn(ACCOUNT.email, PASSWORD);
    expect(sessions.failures).toBe(0);
  });

  it('refuses with 401 when concurrent failures lock it between check and success', async () => {
    const sessions = {
      findPrincipal: jest.fn().mockResolvedValue(await ownerPrincipal()),
      recordFailure: jest.fn(),
      recordSuccess: jest.fn().mockResolvedValue(false),
    };
    const service = new SubscriberSignInService(sessions as unknown as SubscriberSessionRepository);
    await expect(service.signIn(ACCOUNT.email, PASSWORD)).rejects.toBeInstanceOf(
      InvalidCredentialsError,
    );
  });

  it('gives an unknown e-mail the same 401 and counts nothing', async () => {
    const sessions = {
      findPrincipal: jest.fn().mockResolvedValue(null),
      recordFailure: jest.fn(),
      recordSuccess: jest.fn(),
    };
    const service = new SubscriberSignInService(sessions as unknown as SubscriberSessionRepository);
    await expect(service.signIn('nadie@example.org', PASSWORD)).rejects.toBeInstanceOf(
      InvalidCredentialsError,
    );
    expect(sessions.recordFailure).not.toHaveBeenCalled();
  });
});

describe('sign-in lock: the statements that keep it', () => {
  it.each<[PrincipalKind, string]>([
    ['OWNER', 'operations.subscriber_account'],
    ['MEMBER', 'operations.subscriber_member'],
  ])('counts a %s failure in one guarded UPDATE of %s', async (kind, table) => {
    const { writer, calls } = fakeWriter(() => []);
    const repository = new SubscriberSessionRepository(writer);
    await repository.recordFailure(kind, ACCOUNT.subscriber_account_id);
    const [update] = calls;
    expect(update?.sql).toContain(`UPDATE ${table}`);
    expect(update?.sql).toContain('failed_login_count + 1 >= :limit THEN 0');
    expect(update?.sql).toContain('make_interval(mins => :minutes)');
    // A locked row is not counted again, so a lock is never extended by guessing.
    expect(update?.sql).toContain('AND (locked_until IS NULL OR locked_until <= now())');
    expect(update?.replacements).toMatchObject({ limit: 10, minutes: 15 });
  });

  it('lets a lock set meanwhile win over a right password', async () => {
    const { writer, calls } = fakeWriter(() => []);
    const repository = new SubscriberSessionRepository(writer);
    await expect(repository.recordSuccess('OWNER', ACCOUNT.subscriber_account_id)).resolves.toBe(
      false,
    );
    expect(calls[0]?.sql).toContain('SET failed_login_count = 0, locked_until = NULL');
    expect(calls[0]?.sql).toContain('AND (locked_until IS NULL OR locked_until <= now())');
  });

  it('finds an owner before a member, and a member only while ACTIVE', async () => {
    const { writer, calls } = fakeWriter(() => []);
    const repository = new SubscriberSessionRepository(writer);
    await expect(repository.findPrincipal('x@example.org')).resolves.toBeNull();
    expect(calls[0]?.sql).toContain('FROM operations.subscriber_account');
    expect(calls[1]?.sql).toContain("status = 'ACTIVE'");
    expect(calls[1]?.sql).toContain('FROM operations.subscriber_member');
  });
});
