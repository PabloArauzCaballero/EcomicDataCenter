import { timingSafeEqual } from 'node:crypto';

/**
 * Compares a bearer credential against its expected value in constant time.
 *
 * A byte-by-byte comparison leaks the shared secret: an attacker who can time
 * responses recovers it one character at a time. The length check runs first
 * because `timingSafeEqual` throws on mismatched buffers, and the length of a
 * secret is not the part worth hiding.
 */
export function matchesBearerToken(authorization: string | undefined, expected: string): boolean {
  const [scheme, token] = authorization?.split(' ') ?? [];
  if (scheme !== 'Bearer' || !token) return false;
  const provided = Buffer.from(token);
  const reference = Buffer.from(expected);
  return provided.length === reference.length && timingSafeEqual(provided, reference);
}
