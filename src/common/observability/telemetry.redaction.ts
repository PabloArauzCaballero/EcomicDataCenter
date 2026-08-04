import { REDACTED_VALUE, UNTRACED_PATHS } from './telemetry.constants';

/** Extracts the path of a request target that may or may not carry a query. */
function pathOf(target: string): string {
  const separator = target.indexOf('?');
  return separator === -1 ? target : target.slice(0, separator);
}

/**
 * True when the request target belongs to an infrastructure probe.
 *
 * Health, readiness and metrics are polled every few seconds by Docker and
 * NGINX; tracing them would bury real traffic without ever explaining an
 * incident. `/docs` only exists outside production and adds no diagnostic value.
 */
export function isUntracedTarget(target: string | undefined): boolean {
  if (!target) return false;
  const path = pathOf(target);
  return UNTRACED_PATHS.some((excluded) => path === excluded || path.startsWith(`${excluded}/`));
}

/**
 * Replaces the query string with a placeholder.
 *
 * A query parameter of this API can carry a confidential filter value — an
 * entity code, an organization identifier — and a span attribute is stored for
 * as long as the trace is retained. The path is what identifies the operation;
 * the values never are.
 */
export function redactQueryString(target: string | undefined): string | undefined {
  if (!target) return target;
  const separator = target.indexOf('?');
  if (separator === -1) return target;
  return `${target.slice(0, separator)}?${REDACTED_VALUE}`;
}

/**
 * Removes credentials embedded in a URL before it becomes a span attribute.
 *
 * A connection string or an outbound URL of the form `https://user:secret@host`
 * would otherwise publish the secret to everyone with read access to the traces.
 */
export function redactUrlCredentials(url: string): string {
  return url.replace(/\/\/[^/@\s]+@/, `//${REDACTED_VALUE}@`);
}
