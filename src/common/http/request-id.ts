import { randomUUID } from 'node:crypto';

const SAFE_REQUEST_ID = /^[A-Za-z0-9._:-]{1,128}$/u;

/**
 * Returns a client correlation identifier only when it is bounded and safe for logs.
 * Invalid, multi-valued or missing headers are replaced with a server-generated UUID.
 */
export function createRequestId(headerValue: unknown): string {
  if (typeof headerValue === 'string' && SAFE_REQUEST_ID.test(headerValue)) {
    return headerValue;
  }
  return randomUUID();
}
