import type { DataEntryBatchModel } from '../../../database/models';
import {
  batchRequestFingerprint,
  manualRequestFingerprint,
  replayRegistration,
} from '../batch-idempotency';
import type {
  ImportObservationBatchInput,
  RegisterObservationInput,
} from '../observation-input.schemas';

const UUIDS = {
  dataset: '11111111-1111-4111-8111-111111111111',
  artifact: '22222222-2222-4222-8222-222222222222',
  organization: '33333333-3333-4333-8333-333333333333',
  frequency: '44444444-4444-4444-8444-444444444444',
  dimension: '55555555-5555-4555-8555-555555555555',
  codeItem: '66666666-6666-4666-8666-666666666666',
  measure: '77777777-7777-4777-8777-777777777777',
  batch: '88888888-8888-4888-8888-888888888888',
  series: '99999999-9999-4999-8999-999999999999',
  issue: 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa',
} as const;

function record() {
  return {
    frequencyId: UUIDS.frequency,
    periodStart: '2026-01-01',
    periodEnd: '2026-01-31',
    periodCode: '2026-01',
    dimensions: [
      {
        dimensionDefinitionId: UUIDS.dimension,
        codeItemId: UUIDS.codeItem,
      },
    ],
    measures: [{ measureDefinitionId: UUIDS.measure, numericValue: '10.5' }],
    attributes: [],
    confidentialityStatus: 'PUBLIC',
    vintageDate: '2026-02-01',
  };
}

function manual(batchCode: string): RegisterObservationInput {
  return {
    batchCode,
    datasetVersionId: UUIDS.dataset,
    sourceArtifactId: UUIDS.artifact,
    submittedByOrganizationId: UUIDS.organization,
    record: record(),
  };
}

describe('batch idempotency', () => {
  it('does not include the batch code in a request fingerprint', () => {
    expect(manualRequestFingerprint(manual('manual-001'))).toBe(
      manualRequestFingerprint(manual('manual-002')),
    );
  });

  it('changes the fingerprint when business data changes', () => {
    const changed = manual('manual-001');
    changed.record.measures[0] = {
      measureDefinitionId: UUIDS.measure,
      numericValue: '10.6',
    };
    expect(manualRequestFingerprint(manual('manual-001'))).not.toBe(
      manualRequestFingerprint(changed),
    );
  });

  it('creates a stable fingerprint for a batch payload', () => {
    const input: ImportObservationBatchInput = {
      ...manual('batch-001'),
      entryMethod: 'API',
      records: [record()],
    };
    const reordered: ImportObservationBatchInput = {
      records: input.records,
      entryMethod: input.entryMethod,
      submittedByOrganizationId: input.submittedByOrganizationId,
      sourceArtifactId: input.sourceArtifactId,
      datasetVersionId: input.datasetVersionId,
      batchCode: input.batchCode,
    };
    expect(batchRequestFingerprint(input)).toBe(batchRequestFingerprint(reordered));
  });

  it('replays a validated stored registration response', () => {
    const input = manual('manual-001');
    const expected = manualRequestFingerprint(input);
    const batch = {
      requestFingerprint: expected,
      resultJson: {
        status: 'PUBLISHED',
        batchId: UUIDS.batch,
        seriesId: UUIDS.series,
        observationId: '1',
        observationRevisionId: '1',
        revisionNumber: 1,
        qualityIssueIds: [UUIDS.issue],
      },
    } as unknown as DataEntryBatchModel;

    expect(replayRegistration(batch, expected).status).toBe('PUBLISHED');
  });
});
