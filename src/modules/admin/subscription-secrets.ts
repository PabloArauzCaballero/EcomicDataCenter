import { createHash, randomBytes, scrypt, timingSafeEqual, type ScryptOptions } from 'node:crypto';

/**
 * The secrets a subscriber holds and the forms in which the register keeps them.
 *
 * Nothing secret is ever stored as given: a password becomes an scrypt hash
 * with its own salt, an API key and a one-time token become the SHA-256 of the
 * value handed out once. None of these functions log, and none of their
 * errors carry the value they were given.
 */

export const PASSWORD_MINIMUM_LENGTH = 10;
export const API_KEY_PREFIX = 'obs_live_';
/** How many leading characters of a key are kept in clear to tell keys apart. */
export const API_KEY_VISIBLE_LENGTH = 16;
export const TOKEN_VALIDITY_DAYS = 7;

const SCRYPT_COST = 16384;
const SCRYPT_BLOCK_SIZE = 8;
const SCRYPT_PARALLELISM = 1;
const SCRYPT_KEY_LENGTH = 64;
const SALT_BYTES = 16;

function deriveKey(
  password: string,
  salt: Buffer,
  keyLength: number,
  options: ScryptOptions,
): Promise<Buffer> {
  return new Promise((resolve, reject) => {
    scrypt(password.normalize('NFKC'), salt, keyLength, options, (error, derived) => {
      if (error) reject(error);
      else resolve(derived);
    });
  });
}

/** Hashes a password as `scrypt$N$r$p$saltB64$hashB64`. */
export async function hashPassword(password: string): Promise<string> {
  const salt = randomBytes(SALT_BYTES);
  const derived = await deriveKey(password, salt, SCRYPT_KEY_LENGTH, {
    N: SCRYPT_COST,
    r: SCRYPT_BLOCK_SIZE,
    p: SCRYPT_PARALLELISM,
    maxmem: 64 * 1024 * 1024,
  });
  return [
    'scrypt',
    SCRYPT_COST,
    SCRYPT_BLOCK_SIZE,
    SCRYPT_PARALLELISM,
    salt.toString('base64'),
    derived.toString('base64'),
  ].join('$');
}

/**
 * A stored hash used when the account is unknown or has no password yet.
 *
 * Verifying against it costs the same scrypt work as a real comparison, so the
 * time a sign-in takes does not tell a caller whether an e-mail has an account.
 */
let decoyHash: Promise<string> | null = null;
function decoy(): Promise<string> {
  decoyHash ??= hashPassword(randomBytes(24).toString('base64url'));
  return decoyHash;
}

/**
 * Checks a password against a stored hash in constant time.
 *
 * A null or malformed hash still runs the full derivation against a decoy and
 * then answers false, so «no such account» and «wrong password» cost the same.
 */
export async function verifyPassword(password: string, stored: string | null): Promise<boolean> {
  const parsed = parseHash(stored) ?? parseHash(await decoy());
  if (!parsed) return false;
  const derived = await deriveKey(password, parsed.salt, parsed.hash.length, {
    N: parsed.cost,
    r: parsed.blockSize,
    p: parsed.parallelism,
    maxmem: 256 * parsed.cost * parsed.blockSize + 32 * 1024 * 1024,
  });
  const matches = derived.length === parsed.hash.length && timingSafeEqual(derived, parsed.hash);
  return matches && parseHash(stored) !== null;
}

interface ParsedHash {
  readonly cost: number;
  readonly blockSize: number;
  readonly parallelism: number;
  readonly salt: Buffer;
  readonly hash: Buffer;
}

function parseHash(stored: string | null): ParsedHash | null {
  if (!stored) return null;
  const parts = stored.split('$');
  if (parts.length !== 6 || parts[0] !== 'scrypt') return null;
  const [cost, blockSize, parallelism] = [Number(parts[1]), Number(parts[2]), Number(parts[3])];
  const salt = Buffer.from(parts[4] ?? '', 'base64');
  const hash = Buffer.from(parts[5] ?? '', 'base64');
  const sane =
    Number.isInteger(cost) &&
    cost >= 1024 &&
    cost <= 1 << 20 &&
    Number.isInteger(blockSize) &&
    blockSize >= 1 &&
    blockSize <= 32 &&
    Number.isInteger(parallelism) &&
    parallelism >= 1 &&
    parallelism <= 16 &&
    salt.length >= SALT_BYTES &&
    hash.length >= 32;
  return sane ? { cost, blockSize, parallelism, salt, hash } : null;
}

/** SHA-256 in lowercase hex: the only form in which keys and tokens are kept. */
export function sha256Hex(value: string): string {
  return createHash('sha256').update(value, 'utf8').digest('hex');
}

export interface IssuedApiKey {
  /** The full key, shown to the customer once and never stored. */
  readonly key: string;
  readonly prefix: string;
  readonly hash: string;
}

export function issueApiKey(): IssuedApiKey {
  const key = `${API_KEY_PREFIX}${randomBytes(32).toString('base64url')}`;
  return { key, prefix: key.slice(0, API_KEY_VISIBLE_LENGTH), hash: sha256Hex(key) };
}

export interface IssuedToken {
  readonly token: string;
  readonly hash: string;
  readonly expiresAt: Date;
}

/** A single-use activation or reset token, valid for seven days from `now`. */
export function issueToken(now: Date = new Date()): IssuedToken {
  const token = randomBytes(32).toString('base64url');
  const expiresAt = new Date(now.getTime() + TOKEN_VALIDITY_DAYS * 24 * 60 * 60 * 1000);
  return { token, hash: sha256Hex(token), expiresAt };
}
