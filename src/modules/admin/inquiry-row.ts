import type { InquiryStatus } from './inquiry.schemas';

/** One stored inquiry as the repositories read it back. */
export interface InquiryRow {
  service_inquiry_id: string;
  full_name: string;
  email: string;
  organization: string | null;
  phone: string | null;
  plan_code: string;
  message: string;
  source_route: string;
  status: InquiryStatus;
  operator_note: string | null;
  created_at: Date;
  /**
   * `created_at` printed with its microseconds, used only for the cursor.
   *
   * A JavaScript `Date` keeps milliseconds, and the column keeps microseconds.
   * A cursor built from the `Date` would sit up to 999 µs before the row it
   * names, and every row inserted inside that sliver would fall between two
   * pages and never be shown.
   */
  created_at_key: string;
  updated_at: Date | null;
  updated_by: string | null;
}

/** The select list shared by every read of the register, so the shapes cannot drift. */
export const INQUIRY_COLUMNS = `
  service_inquiry_id::text AS service_inquiry_id, full_name, email, organization, phone,
  plan_code, message, source_route, status, operator_note, created_at,
  to_char(created_at AT TIME ZONE 'UTC', 'YYYY-MM-DD"T"HH24:MI:SS.US"Z"') AS created_at_key,
  updated_at, updated_by`;

export interface InquiryItem {
  readonly serviceInquiryId: string;
  readonly fullName: string;
  readonly email: string;
  readonly organization: string | null;
  readonly phone: string | null;
  readonly planCode: string;
  readonly message: string;
  readonly sourceRoute: string;
  readonly status: InquiryStatus;
  readonly operatorNote: string | null;
  readonly createdAt: string;
  readonly updatedAt: string | null;
  readonly updatedBy: string | null;
}

export function toInquiryItem(row: InquiryRow): InquiryItem {
  return {
    serviceInquiryId: row.service_inquiry_id,
    fullName: row.full_name,
    email: row.email,
    organization: row.organization,
    phone: row.phone,
    planCode: row.plan_code,
    message: row.message,
    sourceRoute: row.source_route,
    status: row.status,
    operatorNote: row.operator_note,
    createdAt: row.created_at.toISOString(),
    updatedAt: row.updated_at ? row.updated_at.toISOString() : null,
    updatedBy: row.updated_by,
  };
}
