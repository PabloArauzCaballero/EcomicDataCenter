import { Global, Inject, Module, OnApplicationShutdown } from '@nestjs/common';
import type { Sequelize } from 'sequelize-typescript';
import { ReadQueryExecutor } from '../common/persistence/read-query.executor';
import { ENVIRONMENT } from '../config/configuration.module';
import type { Environment } from '../config/environment';
import {
  initializeDatabaseConnections,
  type DatabaseConnections,
} from './database-connections';
import { DATABASE_CONNECTIONS, READER_DATABASE, WRITER_DATABASE } from './database.tokens';

@Global()
@Module({
  providers: [
    {
      provide: DATABASE_CONNECTIONS,
      inject: [ENVIRONMENT],
      useFactory: (environment: Environment) => initializeDatabaseConnections(environment),
    },
    {
      provide: WRITER_DATABASE,
      inject: [DATABASE_CONNECTIONS],
      useFactory: (connections: DatabaseConnections): Sequelize => connections.writer,
    },
    {
      provide: READER_DATABASE,
      inject: [DATABASE_CONNECTIONS],
      useFactory: (connections: DatabaseConnections): Sequelize => connections.reader,
    },
    DatabaseLifecycle,
    ReadQueryExecutor,
  ],
  exports: [WRITER_DATABASE, READER_DATABASE, ReadQueryExecutor],
})
export class DatabaseModule {}

class DatabaseLifecycle implements OnApplicationShutdown {
  constructor(
    @Inject(DATABASE_CONNECTIONS) private readonly connections: DatabaseConnections,
  ) {}

  /** Closes both pools during graceful process termination. */
  async onApplicationShutdown(): Promise<void> {
    await Promise.allSettled([
      this.connections.writer.close(),
      this.connections.reader.close(),
    ]);
  }
}
