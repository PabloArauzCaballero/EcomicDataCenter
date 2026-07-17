import type { Sequelize } from 'sequelize-typescript';
import type { Environment } from '../../config/environment';
import { initializeDatabaseConnections } from '../database-connections';

function databaseDouble(
  authenticate: jest.Mock<Promise<void>, []>,
  close: jest.Mock<Promise<void>, []>,
): Sequelize {
  return { authenticate, close } as unknown as Sequelize;
}

describe('initializeDatabaseConnections', () => {
  const environment = {} as Environment;

  it('returns both authenticated pools', async () => {
    const writerAuthenticate = jest.fn(async () => undefined);
    const readerAuthenticate = jest.fn(async () => undefined);
    const writer = databaseDouble(
      writerAuthenticate,
      jest.fn(async () => undefined),
    );
    const reader = databaseDouble(
      readerAuthenticate,
      jest.fn(async () => undefined),
    );

    const result = await initializeDatabaseConnections(environment, {
      createWriter: () => writer,
      createReader: () => reader,
    });

    expect(result).toEqual({ writer, reader });
    expect(writerAuthenticate).toHaveBeenCalledTimes(1);
    expect(readerAuthenticate).toHaveBeenCalledTimes(1);
  });

  it('closes every created pool when reader authentication fails', async () => {
    const startupFailure = new Error('reader unavailable');
    const writerClose = jest.fn(async () => undefined);
    const readerClose = jest.fn(async () => undefined);
    const writer = databaseDouble(
      jest.fn(async () => undefined),
      writerClose,
    );
    const reader = databaseDouble(
      jest.fn(async () => Promise.reject(startupFailure)),
      readerClose,
    );

    await expect(
      initializeDatabaseConnections(environment, {
        createWriter: () => writer,
        createReader: () => reader,
      }),
    ).rejects.toBe(startupFailure);

    expect(writerClose).toHaveBeenCalledTimes(1);
    expect(readerClose).toHaveBeenCalledTimes(1);
  });
});
