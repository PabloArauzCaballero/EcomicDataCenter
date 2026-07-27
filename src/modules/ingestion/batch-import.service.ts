import { ForbiddenException, Inject, Injectable } from '@nestjs/common';
import type { Sequelize, Transaction } from 'sequelize';
import { AuditService } from '../../common/audit/audit.service';
import type { Actor } from '../../common/auth/actor';
import { ApplicationError } from '../../common/errors/application.error';
import { MetricsService } from '../../common/observability/metrics.service';
import { withSerializableRetry } from '../../common/persistence.transaction';
import { WRITER_DATABASE } from '../../database/database.tokens';
import {
  assertBatchFingerprint,
  batchRequestFingerprint,
  replayBatchImport,
} from './batch-idempotency';
import type { BatchRegistrationCache } from './batch-registration-cache';
import type { BatchImportResult, BatchRecordResult } from './ingestion-results';
import type { ImportObservationBatchInput } from './observation-input.schemas';
import { ObservationRegistrationService } from './observation-registration.service';
import { ObservationWriteRepository } from './observation-write.repository';

/**
 * Records committed per transaction.
 *
 * Small enough that a serialization conflict replays little work and locks stay
 * short, large enough that a 500-record batch does not pay 500 commits.
 */
const BATCH_CHUNK_SIZE = 50;

@Injectable()
export class BatchImportService {
  constructor(
    @Inject(WRITER_DATABASE) private readonly writer: Sequelize,
    private readonly registration: ObservationRegistrationService,
    private readonly writes: ObservationWriteRepository,
    private readonly metrics: MetricsService,
    private readonly audit: AuditService,
  ) {}

  /**
   * Imports a bounded batch in committed chunks, replaying a completed request.
   *
   * The batch is claimed in its own transaction and the records are then
   * processed in chunks that each commit. A serialization conflict on the last
   * record no longer discards the whole batch, locks are held for a bounded
   * time, and a process restart mid-import can resume because every record
   * operation is idempotent on its own.
   */
  async import(input: ImportObservationBatchInput, actor: Actor): Promise<BatchImportResult> {
    this.assertActorOrganization(actor, input.submittedByOrganizationId);
    const requestFingerprint = batchRequestFingerprint(input);

    const claim = await withSerializableRetry(this.writer, async (transaction) => {
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
      // Reusing a batchCode is only ever a replay or a same-payload resume of an
      // interrupted import. Enforcing the fingerprint on an existing batch closes
      // the in-flight window where a mismatched payload would otherwise be
      // processed and attributed under the first request's provenance.
      if (!claimed) assertBatchFingerprint(batch, requestFingerprint);
      return { batchId: batch.dataEntryBatchId, claimed, completed: batch.resultJson !== null };
    });

    if (!claim.claimed && claim.completed) {
      return this.replayCompleted(input.batchCode, requestFingerprint);
    }

    // Reached on a first claim, or a same-fingerprint resume of an interrupted
    // batch; every record operation is idempotent, so reprocessing is safe.
    const records = await this.processChunks(input, claim.batchId);
    return this.finalize(input, claim.batchId, records);
  }

  /** Replays the stored response of a batch that already finished. */
  private replayCompleted(
    batchCode: string,
    requestFingerprint: string,
  ): Promise<BatchImportResult> {
    return withSerializableRetry(this.writer, async (transaction) => {
      const batch = await this.writes.requireBatchByCode(batchCode, transaction);
      return replayBatchImport(batch, requestFingerprint);
    });
  }

  /** Processes the records in committed chunks, isolating each record. */
  private async processChunks(
    input: ImportObservationBatchInput,
    batchId: string,
  ): Promise<BatchRecordResult[]> {
    const records: BatchRecordResult[] = [];
    // The published structure and active rules are identical for every record in
    // this batch. A batch-scoped cache loads them once and reuses them across
    // chunks instead of re-reading them per record.
    const cache: BatchRegistrationCache = {};
    for (let offset = 0; offset < input.records.length; offset += BATCH_CHUNK_SIZE) {
      const chunk = input.records.slice(offset, offset + BATCH_CHUNK_SIZE);
      const chunkResults = await withSerializableRetry(this.writer, async (transaction) => {
        const results: BatchRecordResult[] = [];
        for (const [chunkIndex, record] of chunk.entries()) {
          results.push(
            await this.processRecord(
              offset + chunkIndex,
              record,
              input,
              batchId,
              transaction,
              cache,
            ),
          );
        }
        return results;
      });
      records.push(...chunkResults);
    }
    return records;
  }

  /** Writes the terminal batch state and the replayable response. */
  private finalize(
    input: ImportObservationBatchInput,
    batchId: string,
    records: readonly BatchRecordResult[],
  ): Promise<BatchImportResult> {
    return withSerializableRetry(this.writer, async (transaction) => {
      const acceptedCount = records.filter((record) =>
        ['PUBLISHED', 'UNCHANGED'].includes(record.status),
      ).length;
      const rejectedCount = input.records.length - acceptedCount;
      const status =
        acceptedCount === 0 ? 'REJECTED' : rejectedCount === 0 ? 'COMMITTED' : 'PARTIAL';
      const result: BatchImportResult = {
        batchId,
        status,
        receivedCount: input.records.length,
        acceptedCount,
        rejectedCount,
        records: [...records],
      };
      const batch = await this.writes.requireBatch(batchId, transaction);
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
      await this.audit.recordInTransaction(
        {
          action: 'ingestion.batch.imported',
          entityType: 'data_entry_batch',
          entityReference: batchId,
          details: { status, receivedCount: input.records.length, acceptedCount, rejectedCount },
        },
        transaction,
      );
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
    cache: BatchRegistrationCache,
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
        cache,
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
