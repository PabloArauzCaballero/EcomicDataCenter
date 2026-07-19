import { ForbiddenException, Inject, Injectable } from '@nestjs/common';
import type { Sequelize, Transaction } from 'sequelize';
import type { Actor } from '../../common/auth/actor';
import { ApplicationError } from '../../common/errors/application.error';
import { MetricsService } from '../../common/observability/metrics.service';
import { withSerializableRetry } from '../../common/persistence.transaction';
import { WRITER_DATABASE } from '../../database/database.tokens';
import { batchRequestFingerprint, replayBatchImport } from './batch-idempotency';
import type { BatchImportResult, BatchRecordResult } from './ingestion-results';
import type { ImportObservationBatchInput } from './observation-input.schemas';
import { ObservationRegistrationService } from './observation-registration.service';
import { ObservationWriteRepository } from './observation-write.repository';

@Injectable()
export class BatchImportService {
  constructor(
    @Inject(WRITER_DATABASE) private readonly writer: Sequelize,
    private readonly registration: ObservationRegistrationService,
    private readonly writes: ObservationWriteRepository,
    private readonly metrics: MetricsService,
  ) {}

  /** Imports a bounded batch and replays a previous response for the same request. */
  import(input: ImportObservationBatchInput, actor: Actor): Promise<BatchImportResult> {
    this.assertActorOrganization(actor, input.submittedByOrganizationId);
    const requestFingerprint = batchRequestFingerprint(input);

    return withSerializableRetry(this.writer, async (transaction) => {
      await this.writes.assertProvenance(
        input.datasetVersionId,
        input.sourceArtifactId,
        input.submittedByOrganizationId,
        transaction,
      );
      const { batch, claimed } = await this.writes.claimBatch(
        {
          datasetVersionId: input.datasetVersionId,
          sourceArtifactId: input.sourceArtifactId,
          submittedByOrganizationId: input.submittedByOrganizationId,
          batchCode: input.batchCode,
          entryMethod: input.entryMethod,
          requestFingerprint,
          receivedCount: input.records.length,
          ...(input.notes ? { notes: input.notes } : {}),
        },
        transaction,
      );
      if (!claimed) return replayBatchImport(batch, requestFingerprint);

      const records: BatchRecordResult[] = [];
      for (const [index, record] of input.records.entries()) {
        records.push(
          await this.processRecord(index, record, input, batch.dataEntryBatchId, transaction),
        );
      }
      const acceptedCount = records.filter((record) =>
        ['PUBLISHED', 'UNCHANGED'].includes(record.status),
      ).length;
      const rejectedCount = input.records.length - acceptedCount;
      const status =
        acceptedCount === 0 ? 'REJECTED' : rejectedCount === 0 ? 'COMMITTED' : 'PARTIAL';
      const result: BatchImportResult = {
        batchId: batch.dataEntryBatchId,
        status,
        receivedCount: input.records.length,
        acceptedCount,
        rejectedCount,
        records,
      };
      await batch.update(
        {
          status,
          acceptedCount: String(acceptedCount),
          rejectedCount: String(rejectedCount),
          completedAt: new Date(),
          resultJson: { ...result },
        },
        { transaction },
      );
      return result;
    }).then((result) => {
      for (const record of result.records) {
        this.metrics.observeIngestion('batch', record.status);
      }
      return result;
    });
  }

  private async processRecord(
    index: number,
    record: ImportObservationBatchInput['records'][number],
    input: ImportObservationBatchInput,
    batchId: string,
    parentTransaction: Transaction,
  ): Promise<BatchRecordResult> {
    const savepoint = `batch_record_${index}`;
    await this.writer.query(`SAVEPOINT ${savepoint}`, { transaction: parentTransaction });
    try {
      const result = await this.registration.registerWithinBatch(
        {
          datasetVersionId: input.datasetVersionId,
          sourceArtifactId: input.sourceArtifactId,
          dataEntryBatchId: batchId,
          record,
        },
        parentTransaction,
      );
      await this.writer.query(`RELEASE SAVEPOINT ${savepoint}`, {
        transaction: parentTransaction,
      });
      return {
        index,
        status: result.status,
        observationId: result.observationId,
        ...(result.observationRevisionId ? { revisionId: result.observationRevisionId } : {}),
      };
    } catch (error) {
      await this.writer.query(`ROLLBACK TO SAVEPOINT ${savepoint}`, {
        transaction: parentTransaction,
      });
      await this.writer.query(`RELEASE SAVEPOINT ${savepoint}`, {
        transaction: parentTransaction,
      });
      if (!(error instanceof ApplicationError)) throw error;
      return {
        index,
        status: 'INVALID',
        error: { code: error.code, message: error.message },
      };
    }
  }

  private assertActorOrganization(actor: Actor, submittedByOrganizationId: string): void {
    if (actor.organizationId && actor.organizationId !== submittedByOrganizationId) {
      throw new ForbiddenException('Actor cannot submit a batch for another organization');
    }
  }
}
