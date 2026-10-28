import {
  SIGN_IN_FAILURE_LIMIT,
  SIGN_IN_LOCK_MINUTES,
  SubscriberSessionRepository,
  type Principal,
  type PrincipalKind,
} from '../subscriber-session.repository';
import { SubscriberSignInService } from '../subscriber-sign-in.service';
import { AccountLockedError, InvalidCredentialsError } from '../subscription-errors';
import { hashPassword } from '../subscription-secrets';
import { ACCOUNT, fakeWriter } from './subscription-fixtures';

const PASSWORD = 'una-clave-larga';

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

  private retry(): number | null {
    return this.lockedUntil && this.lockedUntil > this.now
      ? Math.ceil((this.lockedUntil - this.now) / 1000)
      : null;
  }

  findPrincipal(): Promise<Principal> {
    return Promise.resolve({ ...this.principal, retryAfterSeconds: this.retry() });
  }

  recordFailure(): Promise<void> {
    if (this.retry()) return Promise.resolve();
    this.failures += 1;
    if (this.failures >= SIGN_IN_FAILURE_LIMIT) {
      this.failures = 0;
      this.lockedUntil = this.now + SIGN_IN_LOCK_MINUTES * 60_000;
    } else this.lockedUntil = null;
    return Promise.resolve();
  }

  recordSuccess(): Promise<number | null> {
    if (this.retry()) return Promise.resolve(this.retry());
    this.successes += 1;
    this.failures = 0;
    this.lockedUntil = null;
    return Promise.resolve(null);
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
    passwordHash: await hashPassword(PASSWORD),
    retryAfterSeconds: null,
  };
}

function serviceOver(sessions: LockingSessions): SubscriberSignInService {
  return new SubscriberSignInService(sessions as unknown as SubscriberSessionRepository);
}

describe('sign-in lock', () => {
  it('locks on the tenth consecutive failure, which still answers the generic 401', async () => {
    const sessions = new LockingSessions(await ownerPrincipal(), Date.now());
    const service = serviceOver(sessions);
    for (let attempt = 1; attempt <= SIGN_IN_FAILURE_LIMIT; attempt += 1) {
      await expect(service.signIn(ACCOUNT.email, 'otra-clave-xx')).rejects.toBeInstanceOf(
        InvalidCredentialsError,
      );
    }
    expect(sessions.failures).toBe(0);
    expect(sessions.lockedUntil).not.toBeNull();
  });

  it('while locked, answers 423 with the seconds left only to the right password', async () => {
    const sessions = new LockingSessions(await ownerPrincipal(), Date.now());
    const service = serviceOver(sessions);
    for (let attempt = 0; attempt < SIGN_IN_FAILURE_LIMIT; attempt += 1) {
      await service.signIn(ACCOUNT.email, 'otra-clave-xx').catch(() => undefined);
    }
    const right = service.signIn(ACCOUNT.email, PASSWORD);
    await expect(right).rejects.toBeInstanceOf(AccountLockedError);
    await expect(right).rejects.toMatchObject({
      statusCode: 423,
      code: 'LOCKED',
      details: { retryAfterSeconds: SIGN_IN_LOCK_MINUTES * 60 },
    });
    expect(sessions.successes).toBe(0);
    sessions.advance(SIGN_IN_LOCK_MINUTES * 60_000 + 1);
    await expect(service.signIn(ACCOUNT.email, PASSWORD)).resolves.toMatchObject({
      kind: 'OWNER',
    });
  });

  it('while locked, gives a wrong password the same 401 as an unknown e-mail and counts nothing', async () => {
    const sessions = new LockingSessions(await ownerPrincipal(), Date.now());
    const service = serviceOver(sessions);
    for (let attempt = 0; attempt < SIGN_IN_FAILURE_LIMIT; attempt += 1) {
      await service.signIn(ACCOUNT.email, 'otra-clave-xx').catch(() => undefined);
    }
    const lockedUntil = sessions.lockedUntil;
    const recordFailure = jest.spyOn(sessions, 'recordFailure');
    const wrong = service.signIn(ACCOUNT.email, 'otra-clave-xx');
    await expect(wrong).rejects.toBeInstanceOf(InvalidCredentialsError);
    await expect(wrong).rejects.toMatchObject({
      statusCode: 401,
      message: 'Invalid e-mail or password',
    });
    // Not counted, and the lock is not extended.
    expect(recordFailure).not.toHaveBeenCalled();
    expect(sessions.failures).toBe(0);
    expect(sessions.lockedUntil).toBe(lockedUntil);
  });

  it('resets the count on a right password, so failures must be consecutive', async () => {
    const sessions = new LockingSessions(await ownerPrincipal(), Date.now());
    const service = serviceOver(sessions);
    for (let attempt = 1; attempt < SIGN_IN_FAILURE_LIMIT; attempt += 1) {
      await service.signIn(ACCOUNT.email, 'otra-clave-xx').catch(() => undefined);
    }
    await service.signIn(ACCOUNT.email, PASSWORD);
    expect(sessions.failures).toBe(0);
    await expect(service.signIn(ACCOUNT.email, 'otra-clave-xx')).rejects.toBeInstanceOf(
      InvalidCredentialsError,
    );
  });

  it('opens again at once when a token or the operator clears the lock', async () => {
    const sessions = new LockingSessions(await ownerPrincipal(), Date.now());
    const service = serviceOver(sessions);
    for (let attempt = 0; attempt < SIGN_IN_FAILURE_LIMIT; attempt += 1) {
      await service.signIn(ACCOUNT.email, 'otra-clave-xx').catch(() => undefined);
    }
    sessions.unlock();
    await expect(service.signIn(ACCOUNT.email, PASSWORD)).resolves.toMatchObject({
      kind: 'OWNER',
    });
  });

  it('refuses with 423 when concurrent failures lock it between check and success', async () => {
    const principal = await ownerPrincipal();
    const sessions = {
      findPrincipal: jest.fn().mockResolvedValue(principal),
      recordFailure: jest.fn(),
      recordSuccess: jest.fn().mockResolvedValue(840),
    };
    const service = new SubscriberSignInService(sessions as unknown as SubscriberSessionRepository);
    await expect(service.signIn(ACCOUNT.email, PASSWORD)).rejects.toMatchObject({
      statusCode: 423,
      details: { retryAfterSeconds: 840 },
    });
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
    const { writer, calls } = fakeWriter((sql) =>
      sql.startsWith('SELECT') ? [{ retry_after_seconds: 600 }] : [],
    );
    const repository = new SubscriberSessionRepository(writer);
    await expect(repository.recordSuccess('OWNER', ACCOUNT.subscriber_account_id)).resolves.toBe(
      600,
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
