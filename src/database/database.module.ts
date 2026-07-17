import { Global, Inject, Module, OnApplicationShutdown } from '@nestjs/common';
import type { Environment } from '../config/environment';
import { ENVIRONMENT } from '../config/configuration.module';
import { createReaderDatabase, createWriterDatabase } from './database.factory';
import { READER_DATABASE, WRITER_DATABASE } from './database.tokens';
import type { Sequelize } from 'sequelize-typescript';
import { ReadQueryExecutor } from '../common/persistence/read-query.executor';

@Global()
@Module({
  providers: [
    {
      provide: WRITER_DATABASE,
      inject: [ENVIRONMENT],
      useFactory: async (environment: Environment) => {
        const database = createWriterDatabase(environment);
        await database.authenticate();
        return database;
      },
    },
    {
      provide: READER_DATABASE,
      inject: [ENVIRONMENT],
      useFactory: async (environment: Environment) => {
        const database = createReaderDatabase(environment);
        await database.authenticate();
        return database;
      },
    },
    DatabaseLifecycle,
    ReadQueryExecutor,
  ],
  exports: [WRITER_DATABASE, READER_DATABASE, ReadQueryExecutor],
})
export class DatabaseModule {}

class DatabaseLifecycle implements OnApplicationShutdown {
  constructor(
    @Inject(WRITER_DATABASE) private readonly writer: Sequelize,
    @Inject(READER_DATABASE) private readonly reader: Sequelize,
  ) {}

  async onApplicationShutdown(): Promise<void> {
    await Promise.allSettled([this.writer.close(), this.reader.close()]);
  }
}
