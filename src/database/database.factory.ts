import { Sequelize } from 'sequelize-typescript';
import type { Environment } from '../config/environment';
import { DATABASE_MODELS } from './models/model.registry';

interface PostgresDialectOptions {
  application_name: string;
  connectionTimeoutMillis: number;
  statement_timeout: number;
  idle_in_transaction_session_timeout: number;
  ssl: false | { require: true; rejectUnauthorized: true };
}

function dialectOptions(
  environment: Environment,
  role: 'reader' | 'writer',
): PostgresDialectOptions {
  return {
    application_name: `${environment.APP_NAME}-${role}`,
    connectionTimeoutMillis: environment.DATABASE_CONNECT_TIMEOUT_MS,
    statement_timeout: environment.DATABASE_STATEMENT_TIMEOUT_MS,
    idle_in_transaction_session_timeout: environment.DATABASE_STATEMENT_TIMEOUT_MS * 2,
    ssl: environment.DATABASE_SSL ? { require: true, rejectUnauthorized: true } : false,
  };
}

/** Creates the bounded writer pool used only for runtime DML operations. */
export function createWriterDatabase(environment: Environment): Sequelize {
  return new Sequelize(environment.DATABASE_WRITER_URL, {
    dialect: 'postgres',
    models: [...DATABASE_MODELS],
    logging: false,
    pool: {
      max: environment.DATABASE_POOL_MAX_WRITER,
      min: environment.DATABASE_POOL_MIN,
      acquire: environment.DATABASE_POOL_ACQUIRE_MS,
      idle: environment.DATABASE_POOL_IDLE_MS,
    },
    dialectOptions: dialectOptions(environment, 'writer'),
    define: { timestamps: false, freezeTableName: true, underscored: true },
    retry: { max: 0 },
  });
}

/** Creates the bounded reader pool isolated from write credentials and models. */
export function createReaderDatabase(environment: Environment): Sequelize {
  return new Sequelize(environment.DATABASE_READER_URL, {
    dialect: 'postgres',
    logging: false,
    pool: {
      max: environment.DATABASE_POOL_MAX_READER,
      min: environment.DATABASE_POOL_MIN,
      acquire: environment.DATABASE_POOL_ACQUIRE_MS,
      idle: environment.DATABASE_POOL_IDLE_MS,
    },
    dialectOptions: dialectOptions(environment, 'reader'),
    retry: { max: 0 },
  });
}
