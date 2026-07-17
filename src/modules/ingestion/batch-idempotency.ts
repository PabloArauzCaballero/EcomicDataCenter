import { createHash } from 'node:crypto';
import { ConflictError, InfrastructureError } from '../../common/errors/application.error';
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

function canonicalize(value: unknown): unknown {
  if (Array.isArray(value)) return value.map(canonicalize);
  if (!value || typeof value !== 'object') return value;
  return Object.fromEntries(
    Object.entries(value as Record<string, unknown>)
      .sort(([left], [right]) => left.localeCompare(right))
      .map(([key, entry]) => [key, canonicalize(entry)]),
  );
}

function fingerprint(value: unknown): string {
  return createHash('sha256')
    .update(JSON.stringify(canonicalize(value)))
    .digest('hex');
}

export function manualRequestFingerprint(input: RegisterObservationInput): string {
  const { batchCode: _idempotencyKey, ...payload } = input;
  return fingerprint(payload);
}

export function batchRequestFingerprint(input: ImportObservationBatchInput): string {
  const { batchCode: _idempotencyKey, ...payload } = input;
  return fingerprint(payload);
}

function assertFingerprint(batch: DataEntryBatchModel, expected: string): void {
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
  assertFingerprint(batch, expected);
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
  assertFingerprint(batch, expected);
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
