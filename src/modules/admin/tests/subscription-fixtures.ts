import type { Sequelize } from 'sequelize';
import type { DeploymentIdentity } from '../deployment-identity';
import type { AccountRow } from '../subscription-account-row';
import type { MemberRow } from '../subscription-member-row';

/** Shared rows and fakes for the subscription specs; no database is touched. */

export const ACCOUNT: AccountRow = {
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
  session_version: 1,
  locked_until: null,
  created_at: new Date('2026-10-01T00:00:00Z'),
  created_at_key: '2026-10-01T00:00:00.000000Z',
};

export const MEMBER: MemberRow = {
  subscriber_member_id: '1f2e3d4c-5b6a-4789-8a0b-1c2d3e4f5a6b',
  subscriber_account_id: ACCOUNT.subscriber_account_id,
  email: 'luis@example.org',
  full_name: 'Luis Mamani',
  status: 'ACTIVE',
  session_version: 3,
  activated: true,
  created_at: new Date('2026-10-02T00:00:00Z'),
};

export const identity = { environmentId: 'test' } as DeploymentIdentity;

export interface RecordedQuery {
  readonly sql: string;
  readonly replacements: Readonly<Record<string, unknown>>;
}

/**
 * A writer that records every statement and answers from `respond`. Its
 * transactions run the work at once, which is all a repository needs from them
 * to be exercised here; what the database itself guarantees is asserted on the
 * SQL text, not simulated.
 */
export function fakeWriter(
  respond: (sql: string, replacements: Readonly<Record<string, unknown>>) => unknown[],
): { writer: Sequelize; calls: RecordedQuery[] } {
  const calls: RecordedQuery[] = [];
  const writer = {
    query: (sql: string, options?: { replacements?: Record<string, unknown> }) => {
      const replacements = options?.replacements ?? {};
      calls.push({ sql: sql.trim(), replacements });
      return Promise.resolve(respond(sql.trim(), replacements));
    },
    transaction: <T>(work: (transaction: object) => Promise<T>) => work({}),
  };
  return { writer: writer as unknown as Sequelize, calls };
}

/** A Fastify reply that keeps the status and body a handler sent. */
export function fakeReply(): {
  reply: { status: (code: number) => { send: (body: unknown) => void } };
  sent: { status: number | null; body: unknown };
} {
  const sent: { status: number | null; body: unknown } = { status: null, body: undefined };
  const reply = {
    status: (code: number) => {
      sent.status = code;
      return {
        send: (body: unknown) => {
          sent.body = body;
        },
      };
    },
  };
  return { reply, sent };
}
