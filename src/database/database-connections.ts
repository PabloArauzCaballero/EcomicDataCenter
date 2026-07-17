import type { Sequelize } from 'sequelize-typescript';
import type { Environment } from '../config/environment';
import { createReaderDatabase, createWriterDatabase } from './database.factory';

export interface DatabaseConnections {
  readonly writer: Sequelize;
  readonly reader: Sequelize;
}

interface DatabaseConnectionFactories {
  readonly createWriter: (environment: Environment) => Sequelize;
  readonly createReader: (environment: Environment) => Sequelize;
}

const defaultFactories: DatabaseConnectionFactories = {
  createWriter: createWriterDatabase,
  createReader: createReaderDatabase,
};

/**
 * Opens both runtime pools as one atomic resource group.
 *
 * A partial startup must close every pool already created. Without this cleanup,
 * a failed reader authentication can leave the writer pool holding sockets and
 * prevent the process from terminating after bootstrap failure.
 */
export async function initializeDatabaseConnections(
  environment: Environment,
  factories: DatabaseConnectionFactories = defaultFactories,
): Promise<DatabaseConnections> {
  let writer: Sequelize | undefined;
  let reader: Sequelize | undefined;

  try {
    writer = factories.createWriter(environment);
    reader = factories.createReader(environment);
    await writer.authenticate();
    await reader.authenticate();
    return { writer, reader };
  } catch (error) {
    await Promise.allSettled([writer?.close(), reader?.close()]);
    throw error;
  }
}
