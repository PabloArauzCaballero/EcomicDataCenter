import type { AccountStatus, BillingPeriod, PlanCode, UsageKind } from './subscription.schemas';

/** How long a lapsed account keeps its rights while the next payment arrives. */
export const GRACE_DAYS = 5;
const DAY_MS = 24 * 60 * 60 * 1000;

export type EffectiveStatus = AccountStatus | 'GRACE' | 'EXPIRED';

/**
 * What an account may do right now, computed at read time from what is stored.
 *
 * Nothing rewrites `status` when a period ends: a cron that flips rows would
 * be one more thing that can fail quietly, and the answer would be stale
 * between its runs. Instead the stored status says what the operator decided
 * and `paid_until` says until when; this function joins them on every read.
 */
export function effectiveStatus(
  status: AccountStatus,
  paidUntil: Date | null,
  now: Date = new Date(),
): EffectiveStatus {
  if (status !== 'TRIAL' && status !== 'ACTIVE') return status;
  if (!paidUntil) return 'EXPIRED';
  if (paidUntil.getTime() >= now.getTime()) return status;
  if (paidUntil.getTime() >= now.getTime() - GRACE_DAYS * DAY_MS) return 'GRACE';
  return 'EXPIRED';
}

export function isEntitled(state: EffectiveStatus): boolean {
  return state === 'ACTIVE' || state === 'TRIAL' || state === 'GRACE';
}

/**
 * The last second of a calendar day in La Paz, as an instant.
 *
 * Bolivia keeps UTC−4 all year, without daylight saving, so a fixed offset is
 * exact. A payment that «covers until 2026-11-30» therefore lasts until
 * 2026-11-30 23:59:59 local time, not until midnight UTC four hours earlier.
 */
export function endOfLaPazDay(day: string): Date {
  return new Date(`${day}T23:59:59.000-04:00`);
}

/** One stored account as the repositories read it back. */
export interface AccountRow {
  subscriber_account_id: string;
  email: string;
  full_name: string;
  organization: string | null;
  legal_name: string | null;
  tax_id: string | null;
  plan_code: PlanCode;
  billing_period: BillingPeriod;
  status: AccountStatus;
  paid_until: Date | null;
  /** Raised to end every session the site issued before; starts at 1. */
  session_version: number;
  /** While in the future, sign-in answers 423 even with the right password. */
  locked_until: Date | null;
  created_at: Date;
  /** `created_at` with its microseconds, used only for the cursor. */
  created_at_key: string;
}

/** The select list shared by every read of an account, never the password hash. */
export const ACCOUNT_COLUMNS = `
  subscriber_account_id::text AS subscriber_account_id, email, full_name, organization,
  legal_name, tax_id, plan_code, billing_period, status, paid_until, session_version,
  locked_until, created_at,
  to_char(created_at AT TIME ZONE 'UTC', 'YYYY-MM-DD"T"HH24:MI:SS.US"Z"') AS created_at_key`;

/** The first day of the current month in UTC, the key of the usage counters. */
export const CURRENT_MONTH = `(date_trunc('month', now() AT TIME ZONE 'UTC'))::date`;

export interface AccountSummary {
  readonly subscriberAccountId: string;
  readonly email: string;
  readonly fullName: string;
  readonly organization: string | null;
  readonly legalName: string | null;
  readonly taxId: string | null;
  readonly planCode: PlanCode;
  readonly billingPeriod: BillingPeriod;
  readonly status: AccountStatus;
  readonly effectiveStatus: EffectiveStatus;
  readonly entitled: boolean;
  readonly paidUntil: string | null;
  readonly sessionVersion: number;
  /** Null once the lock has passed, even if the stored instant is still there. */
  readonly lockedUntil: string | null;
  readonly createdAt: string;
}

export function toAccountSummary(row: AccountRow, now: Date = new Date()): AccountSummary {
  const state = effectiveStatus(row.status, row.paid_until, now);
  return {
    subscriberAccountId: row.subscriber_account_id,
    email: row.email,
    fullName: row.full_name,
    organization: row.organization,
    legalName: row.legal_name,
    taxId: row.tax_id,
    planCode: row.plan_code,
    billingPeriod: row.billing_period,
    status: row.status,
    effectiveStatus: state,
    entitled: isEntitled(state),
    paidUntil: row.paid_until ? row.paid_until.toISOString() : null,
    sessionVersion: Number(row.session_version),
    lockedUntil: activeLock(row.locked_until, now),
    createdAt: row.created_at.toISOString(),
  };
}

/** The instant a sign-in lock ends, as ISO, or null when there is none in force. */
export function activeLock(lockedUntil: Date | null, now: Date = new Date()): string | null {
  return lockedUntil && lockedUntil.getTime() > now.getTime() ? lockedUntil.toISOString() : null;
}

export interface UsageCount {
  readonly usageKind: UsageKind;
  readonly used: number;
}
