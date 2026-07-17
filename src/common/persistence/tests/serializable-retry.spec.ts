import type { Sequelize, Transaction } from 'sequelize';
import { isRetryableTransactionError, withSerializableRetry } from '../serializable-retry';

function postgresError(code: string): unknown {
  return { parent: { code } };
}

describe('withSerializableRetry', () => {
  it('recognizes only rollback-safe PostgreSQL transaction errors', () => {
    expect(isRetryableTransactionError(postgresError('40001'))).toBe(true);
    expect(isRetryableTransactionError(postgresError('40P01'))).toBe(true);
    expect(isRetryableTransactionError(postgresError('23505'))).toBe(false);
  });

  it('retries a serialization failure with bounded delay', async () => {
    let calls = 0;
    const transaction = jest.fn(async (_options: unknown, operation: (value: Transaction) => Promise<string>) => {
      calls += 1;
      if (calls === 1) throw postgresError('40001');
      return operation({} as Transaction);
    });
    const sleep = jest.fn(async () => undefined);

    const result = await withSerializableRetry(
      { transaction } as unknown as Sequelize,
      async () => 'ok',
      { maxAttempts: 2, random: () => 0.5, sleep },
    );

    expect(result).toBe('ok');
    expect(transaction).toHaveBeenCalledTimes(2);
    expect(sleep).toHaveBeenCalledWith(12);
  });

  it('does not retry business or constraint errors', async () => {
    const transaction = jest.fn(async () => { throw postgresError('23505'); });
    await expect(withSerializableRetry({ transaction } as unknown as Sequelize, async () => 'never')).rejects.toEqual(postgresError('23505'));
    expect(transaction).toHaveBeenCalledTimes(1);
  });
});
