import { ConflictError, InfrastructureError } from '../../common/errors/application.error';
import { canonicalHash } from '../../common/hashing/canonical-hash';
import type { DataEntryBatchModel } from '../../database/models';
import type {
  ImportObservationBatchInput,
  RegisterObservationInput,
} from './observation-input.schemas';
import {
  batchImportResultSchema,
  registrationResultSchema,
  type BatchImportResult,
  type RegistrationResult,
} from './ingestion-results';

const fingerprint = canonicalHash;

/**
 * Hashes only the validated business payload, excluding the idempotency key.
 * Explicit field selection prevents accidental enumerable properties from
 * changing replay semantics when callers construct typed objects with spreads.
 */
export function manualRequestFingerprint(input: RegisterObservationInput): string {
  return fingerprint({
    datasetVersionId: input.datasetVersionId,
    sourceArtifactId: input.sourceArtifactId,
    submittedByOrganizationId: input.submittedByOrganizationId,
    record: input.record,
  });
}

/** Hashes the batch command independently of key order and `batchCode`. */
export function batchRequestFingerprint(input: ImportObservationBatchInput): string {
  return fingerprint({
    datasetVersionId: input.datasetVersionId,
    sourceArtifactId: input.sourceArtifactId,
    submittedByOrganizationId: input.submittedByOrganizationId,
    entryMethod: input.entryMethod,
    ...(input.notes === undefined ? {} : { notes: input.notes }),
    records: input.records,
  });
}

/**
 * Rejects reuse of a batchCode with a different payload.
 *
 * Exported so the claim step can enforce it on an existing-but-unfinished batch,
 * closing the in-flight window where a mismatched payload would otherwise be
 * processed and attributed under the original batch's provenance.
 */
export function assertBatchFingerprint(batch: DataEntryBatchModel, expected: string): void {
  if (batch.requestFingerprint !== expected) {
    throw new ConflictError('batchCode was already used with a different request', {
      batchId: batch.dataEntryBatchId,
      batchCode: batch.batchCode,
    });
  }
}

export function replayRegistration(
  batch: DataEntryBatchModel,
  expected: string,
): RegistrationResult {
  assertBatchFingerprint(batch, expected);
  if (!batch.resultJson) {
    throw new ConflictError('An operation with this batchCode is still in progress', {
      batchId: batch.dataEntryBatchId,
      status: batch.status,
    });
  }
  const parsed = registrationResultSchema.safeParse(batch.resultJson);
  if (!parsed.success) throw new InfrastructureError('Stored registration result is invalid');
  return parsed.data;
}

export function replayBatchImport(batch: DataEntryBatchModel, expected: string): BatchImportResult {
  assertBatchFingerprint(batch, expected);
  if (!batch.resultJson) {
    throw new ConflictError('An operation with this batchCode is still in progress', {
      batchId: batch.dataEntryBatchId,
      status: batch.status,
    });
  }
  const parsed = batchImportResultSchema.safeParse(batch.resultJson);
  if (!parsed.success) throw new InfrastructureError('Stored batch result is invalid');
  return parsed.data;
}
