import {
  effectiveStatus,
  endOfLaPazDay,
  isEntitled,
  toAccountSummary,
  type AccountRow,
} from '../subscription-account-row';
import {
  API_KEY_PREFIX,
  hashPassword,
  issueApiKey,
  issueToken,
  sha256Hex,
  verifyPassword,
} from '../subscription-secrets';
import {
  accountCreationSchema,
  apiKeyCreationSchema,
  passwordChangeSchema,
  paymentSchema,
  sessionSchema,
  usageIncrementSchema,
} from '../subscription.schemas';

const NOW = new Date('2026-10-27T12:00:00.000Z');
const DAY = 24 * 60 * 60 * 1000;

describe('subscriber passwords', () => {
  it('hashes as scrypt$N$r$p$salt$hash and verifies the same password', async () => {
    const stored = await hashPassword('correct horse battery');
    expect(stored).toMatch(/^scrypt\$16384\$8\$1\$[A-Za-z0-9+/=]+\$[A-Za-z0-9+/=]+$/u);
    await expect(verifyPassword('correct horse battery', stored)).resolves.toBe(true);
  });

  it('refuses a wrong password', async () => {
    const stored = await hashPassword('correct horse battery');
    await expect(verifyPassword('correct horse batterz', stored)).resolves.toBe(false);
  });

  it('salts every hash, so the same password never hashes twice alike', async () => {
    const [first, second] = await Promise.all([
      hashPassword('same-password'),
      hashPassword('same-password'),
    ]);
    expect(first).not.toEqual(second);
  });

  it('answers false, without throwing, for a missing or malformed hash', async () => {
    await expect(verifyPassword('anything-at-all', null)).resolves.toBe(false);
    await expect(verifyPassword('anything-at-all', 'scrypt$1$1$1$x$y')).resolves.toBe(false);
    await expect(verifyPassword('anything-at-all', 'plain-text')).resolves.toBe(false);
  });

  it('asks a new password for at least ten characters and lowercases the sign-in e-mail', () => {
    const change = { currentPassword: 'x', newPassword: '123456789' };
    expect(passwordChangeSchema.safeParse(change).success).toBe(false);
    expect(passwordChangeSchema.safeParse({ ...change, newPassword: '1234567890' }).success).toBe(
      true,
    );
    expect(sessionSchema.parse({ email: ' Ana@Example.ORG ', password: 'x' }).email).toBe(
      'ana@example.org',
    );
    expect(
      usageIncrementSchema.safeParse({ subscriberAccountId: 'x', usageKind: 'API', amount: 1 })
        .success,
    ).toBe(false);
  });
});

describe('API keys and tokens', () => {
  it('issues obs_live_ keys of 32 random bytes, keeping only prefix and sha256', () => {
    const issued = issueApiKey();
    expect(issued.key).toMatch(/^obs_live_[A-Za-z0-9_-]{43}$/u);
    expect(issued.key.startsWith(API_KEY_PREFIX)).toBe(true);
    expect(issued.prefix).toBe(issued.key.slice(0, 16));
    expect(issued.hash).toBe(sha256Hex(issued.key));
    expect(issued.hash).toMatch(/^[0-9a-f]{64}$/u);
    expect(issueApiKey().key).not.toEqual(issued.key);
  });

  it('hashes with plain SHA-256 in lowercase hex', () => {
    expect(sha256Hex('abc')).toBe(
      'ba7816bf8f01cfea414140de5dae2223b00361a396177a9cb410ff61f20015ad',
    );
  });

  it('issues tokens valid for seven days and stores only their hash', () => {
    const token = issueToken(NOW);
    expect(token.token).toMatch(/^[A-Za-z0-9_-]{43}$/u);
    expect(token.hash).toBe(sha256Hex(token.token));
    expect(token.expiresAt.getTime() - NOW.getTime()).toBe(7 * DAY);
  });
});

describe('effective status', () => {
  const at = (offsetDays: number) => new Date(NOW.getTime() + offsetDays * DAY);

  it('keeps the operator decisions that do not depend on payment', () => {
    for (const status of ['PENDING', 'SUSPENDED', 'CANCELLED'] as const) {
      expect(effectiveStatus(status, at(30), NOW)).toBe(status);
      expect(effectiveStatus(status, null, NOW)).toBe(status);
    }
  });

  it('keeps TRIAL and ACTIVE while paid', () => {
    expect(effectiveStatus('ACTIVE', at(1), NOW)).toBe('ACTIVE');
    expect(effectiveStatus('TRIAL', NOW, NOW)).toBe('TRIAL');
  });

  it('gives five days of grace after paid_until, then expires', () => {
    expect(effectiveStatus('ACTIVE', at(-1), NOW)).toBe('GRACE');
    expect(effectiveStatus('TRIAL', at(-5), NOW)).toBe('GRACE');
    expect(effectiveStatus('ACTIVE', new Date(at(-5).getTime() - 1), NOW)).toBe('EXPIRED');
    expect(effectiveStatus('ACTIVE', null, NOW)).toBe('EXPIRED');
  });

  it('entitles ACTIVE, TRIAL and GRACE only', () => {
    expect(['ACTIVE', 'TRIAL', 'GRACE'].every((s) => isEntitled(s as never))).toBe(true);
    expect(
      ['PENDING', 'SUSPENDED', 'CANCELLED', 'EXPIRED'].some((s) => isEntitled(s as never)),
    ).toBe(false);
  });

  it('summarises an account in camelCase with the computed state', () => {
    const row: AccountRow = {
      subscriber_account_id: '9a7c2f10-1b2c-4d3e-8f40-5a6b7c8d9e0f',
      email: 'ana@example.org',
      full_name: 'Ana Quispe',
      organization: null,
      legal_name: null,
      tax_id: null,
      plan_code: 'profesional',
      billing_period: 'MONTHLY',
      status: 'ACTIVE',
      paid_until: at(-2),
      session_version: 1,
      locked_until: null,
      created_at: at(-40),
      created_at_key: '2026-09-17T12:00:00.000000Z',
    };
    const summary = toAccountSummary(row, NOW);
    expect(summary).toMatchObject({
      effectiveStatus: 'GRACE',
      entitled: true,
      planCode: 'profesional',
    });
    expect(Object.keys(summary)).toEqual([
      'subscriberAccountId',
      'email',
      'fullName',
      'organization',
      'legalName',
      'taxId',
      'planCode',
      'billingPeriod',
      'status',
      'effectiveStatus',
      'entitled',
      'paidUntil',
      'sessionVersion',
      'lockedUntil',
      'createdAt',
    ]);
    expect(JSON.stringify(summary)).not.toContain('password');
  });
});

describe('payment and account rules', () => {
  it('ends a covered day at 23:59:59 in La Paz (UTC-4)', () => {
    expect(endOfLaPazDay('2026-11-30').toISOString()).toBe('2026-12-01T03:59:59.000Z');
  });

  it('accepts bolivianos with at most two decimals', () => {
    expect(paymentSchema.safeParse({ amountBob: 150.5, coversUntil: '2026-11-30' }).success).toBe(
      true,
    );
    expect(paymentSchema.safeParse({ amountBob: 0.07, coversUntil: '2026-11-30' }).success).toBe(
      true,
    );
    expect(paymentSchema.safeParse({ amountBob: 1.005, coversUntil: '2026-11-30' }).success).toBe(
      false,
    );
    expect(paymentSchema.safeParse({ amountBob: 10, coversUntil: '30/11/2026' }).success).toBe(
      false,
    );
  });

  it('lowercases the e-mail of a new account and bounds the trial', () => {
    const base = {
      email: 'Ana@Example.org',
      fullName: 'Ana',
      planCode: 'analista',
      billingPeriod: 'ANNUAL',
    };
    expect(accountCreationSchema.parse(base)).toMatchObject({
      email: 'ana@example.org',
      trialDays: 0,
    });
    expect(accountCreationSchema.safeParse({ ...base, trialDays: 31 }).success).toBe(false);
    expect(accountCreationSchema.safeParse({ ...base, planCode: 'a-medida' }).success).toBe(false);
    expect(accountCreationSchema.safeParse({ ...base, extra: true }).success).toBe(false);
  });

  it('defaults to one active key', () => {
    expect(apiKeyCreationSchema.parse({ label: 'Producción' }).maxActiveKeys).toBe(1);
  });
});
