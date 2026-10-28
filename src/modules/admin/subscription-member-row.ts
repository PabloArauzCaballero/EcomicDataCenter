/** One stored member as the repositories read it back, never its password hash. */
export interface MemberRow {
  subscriber_member_id: string;
  subscriber_account_id: string;
  email: string;
  full_name: string;
  status: MemberStatus;
  session_version: number;
  /** Whether the member has set a password with its activation token. */
  activated: boolean;
  created_at: Date;
}

export const MEMBER_STATUSES = ['ACTIVE', 'REMOVED'] as const;
export type MemberStatus = (typeof MEMBER_STATUSES)[number];

/** The select list shared by every read of a member. */
export const MEMBER_COLUMNS = `
  subscriber_member_id::text AS subscriber_member_id,
  subscriber_account_id::text AS subscriber_account_id, email, full_name, status,
  session_version, (password_hash IS NOT NULL) AS activated, created_at`;

export interface MemberSummary {
  readonly memberId: string;
  readonly email: string;
  readonly fullName: string;
  readonly status: MemberStatus;
  readonly activated: boolean;
  readonly sessionVersion: number;
  readonly createdAt: string;
}

export function toMemberSummary(row: MemberRow): MemberSummary {
  return {
    memberId: row.subscriber_member_id,
    email: row.email,
    fullName: row.full_name,
    status: row.status,
    activated: Boolean(row.activated),
    sessionVersion: Number(row.session_version),
    createdAt: row.created_at.toISOString(),
  };
}
