import type { Sequelize, Transaction } from 'sequelize';
import { Transaction as SequelizeTransaction } from 'sequelize';

const RETRYABLE_TRANSACTION_CODES = new Set(['40001', '40P01']);

export interface TransactionRetryOptions {
  maxAttempts?: number;
  baseDelayMs?: number;
  maximumDelayMs?: number;
  random?: () => number;
  sleep?: (milliseconds: number) => Promise<void>;
}

function databaseErrorCode(error: unknown): string | undefined {
  if (typeof error !== 'object' || error === null) return undefined;
  const parent = 'parent' in error ? (error as { parent?: unknown }).parent : undefined;
  if (typeof parent !== 'object' || parent === null || !('code' in parent)) return undefined;
  const code = (parent as { code?: unknown }).code;
  return typeof code === 'string' ? code : undefined;
}

/** Returns true only for PostgreSQL serialization failures and deadlocks. */
export function isRetryableTransactionError(error: unknown): boolean {
  return RETRYABLE_TRANSACTION_CODES.has(databaseErrorCode(error) ?? '');
}

function retryDelay(attempt: number, options: Required<Pick<TransactionRetryOptions, 'baseDelayMs' | 'maximumDelayMs' | 'random'>>): number {
  const ceiling = Math.min(options.maximumDelayMs, options.baseDelayMs * 2 ** (attempt - 1));
  return Math.floor(options.random() * ceiling);
}

/**
 * Executes a rollback-safe command in a SERIALIZABLE transaction.
 *
 * The callback may be re-executed after PostgreSQL serialization failures or deadlocks.
 * Callers must not perform irreversible external side effects inside the callback.
 */
export async function withSerializableRetry<T>(
  database: Sequelize,
  operation: (transaction: Transaction) => Promise<T>,
  options: TransactionRetryOptions = {},
): Promise<T> {
  const maxAttempts = options.maxAttempts ?? 3;
  const retryOptions = {
    baseDelayMs: options.baseDelayMs ?? 25,
    maximumDelayMs: options.maximumDelayMs ?? 250,
    random: options.random ?? Math.random,
  };
  const sleep = options.sleep ?? ((milliseconds: number) => new Promise<void>((resolve) => setTimeout(resolve, milliseconds)));

  if (!Number.isInteger(maxAttempts) || maxAttempts < 1 || maxAttempts > 10) {
    throw new RangeError('maxAttempts must be an integer between 1 and 10');
  }

  for (let attempt = 1; attempt <= maxAttempts; attempt += 1) {
    try {
      return await database.transaction(
        { isolationLevel: SequelizeTransaction.ISOLATION_LEVELS.SERIALIZABLE },
        operation,
      );
    } catch (error) {
      if (attempt === maxAttempts || !isRetryableTransactionError(error)) throw error;
      await sleep(retryDelay(attempt, retryOptions));
    }
  }

  throw new Error('Serializable retry loop exhausted unexpectedly');
}
