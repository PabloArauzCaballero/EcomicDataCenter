import { Inject, Injectable } from '@nestjs/common';
import { PinoLogger } from 'nestjs-pino';
import type { Sequelize, Transaction } from 'sequelize';
import { Transaction as SequelizeTransaction } from 'sequelize';
import { ApplicationError, InfrastructureError } from '../errors/application.error';
import { toSafeErrorLog } from '../errors/error-logging';
import { MetricsService } from '../observability/metrics.service';
import { READER_DATABASE } from '../../database/database.tokens';

/** Context supplied to domain query repositories inside one read-only transaction. */
export interface ReadQueryContext {
  readonly database: Sequelize;
  readonly transaction: Transaction;
}

/** Opens and observes a bounded read-only transaction without owning domain SQL. */
@Injectable()
export class ReadQueryExecutor {
  constructor(
    @Inject(READER_DATABASE) private readonly reader: Sequelize,
    private readonly metrics: MetricsService,
    private readonly logger: PinoLogger,
  ) {}

  async run<T>(operation: string, query: (context: ReadQueryContext) => Promise<T>): Promise<T> {
    const startedAt = process.hrtime.bigint();
    let outcome: 'success' | 'error' = 'success';
    try {
      return await this.reader.transaction(
        {
          isolationLevel: SequelizeTransaction.ISOLATION_LEVELS.READ_COMMITTED,
          readOnly: true,
        },
        async (transaction) => {
          await this.reader.query('SET LOCAL TRANSACTION READ ONLY', { transaction });
          return query({ database: this.reader, transaction });
        },
      );
    } catch (error) {
      outcome = 'error';
      if (error instanceof ApplicationError) throw error;
      this.logger.error({ error: toSafeErrorLog(error), operation }, 'Read query failed');
      throw new InfrastructureError('Read operation failed', { operation });
    } finally {
      const durationMs = Number(process.hrtime.bigint() - startedAt) / 1_000_000;
      this.metrics.observeDatabaseOperation(operation, outcome, durationMs);
    }
  }
}
