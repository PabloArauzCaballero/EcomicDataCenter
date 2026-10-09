import type { Transaction } from 'sequelize';
import { reconcileExogenousFactors } from '../runners/boot-seed.exogenous-factors';
import { readSeed } from '../runners/seed.utils';
import { roadHashesAlreadyHeld } from '../runners/boot-seed.bolivia-road-network';
import { factorFixture } from './exogenous-factors.fixture';

jest.mock('../../models', () => ({
  RawObservationModel: { sequelize: { query: jest.fn() }, bulkCreate: jest.fn() },
  FactClaimModel: { bulkCreate: jest.fn() },
  ClaimEvidenceModel: { bulkCreate: jest.fn() },
  SourceArtifactModel: { findOne: jest.fn(), create: jest.fn() },
}));
jest.mock('../runners/seed.utils', () => ({ readSeed: jest.fn() }));
jest.mock('../runners/boot-seed.history-provenance', () => ({
  reconcileHistoryRun: jest.fn().mockResolvedValue('agent-run'),
}));
jest.mock('../runners/boot-seed.bolivia-road-network', () => ({
  roadHashesAlreadyHeld: jest.fn(),
}));

interface RawRecord {
  payloadHash: string;
  payloadJson: Record<string, unknown>;
}
interface ArtifactRecord {
  sourceArtifactId: string;
  sha256: string;
}
const { RawObservationModel, FactClaimModel, ClaimEvidenceModel, SourceArtifactModel } =
  jest.requireMock<{
    RawObservationModel: {
      sequelize: { query: jest.Mock<Promise<unknown>, [string, unknown]> };
      bulkCreate: jest.Mock<Promise<Array<{ rawObservationId: string }>>, [RawRecord[], unknown]>;
    };
    FactClaimModel: { bulkCreate: jest.Mock<Promise<unknown>, [unknown, unknown]> };
    ClaimEvidenceModel: { bulkCreate: jest.Mock<Promise<unknown>, [unknown, unknown]> };
    SourceArtifactModel: {
      findOne: jest.Mock<Promise<ArtifactRecord | null>, [{ where: { sha256: string } }]>;
      create: jest.Mock<Promise<ArtifactRecord>, [ArtifactRecord, unknown]>;
    };
  }>('../../models');

describe('factor seed reconciliation', () => {
  const transaction = {} as Transaction;

  it('writes evidence once per revision, reuses artifacts, and preserves a reverted value', async () => {
    const stored = new Set<string>();
    const recorded: Array<{ payloadHash: string; payloadJson: Record<string, unknown> }> = [];
    const artifacts = new Map<string, string>();
    jest
      .mocked(roadHashesAlreadyHeld)
      .mockImplementation(async (hashes) => new Set(hashes.filter((hash) => stored.has(hash))));
    jest.mocked(RawObservationModel.bulkCreate).mockImplementation(async (records) => {
      return records.map((record) => {
        stored.add(record.payloadHash);
        recorded.push({ payloadHash: record.payloadHash, payloadJson: record.payloadJson });
        return { rawObservationId: String(recorded.length) };
      });
    });
    jest.mocked(SourceArtifactModel.findOne).mockImplementation(async (options) => {
      const sha = options.where.sha256;
      const id = artifacts.get(sha);
      return id ? { sourceArtifactId: id, sha256: sha } : null;
    });
    jest.mocked(SourceArtifactModel.create).mockImplementation(async (record) => {
      artifacts.set(record.sha256, record.sourceArtifactId);
      return record;
    });
    const series = factorFixture();
    const point = series.points[0]!;
    jest.mocked(readSeed).mockImplementation(async () => ({ version: 1, series: [series] }));
    await reconcileExogenousFactors('source', transaction);
    point.retrievedAt = '2024-03-03T00:00:00.000Z';
    await reconcileExogenousFactors('source', transaction);
    expect(recorded).toHaveLength(1);
    point.value = '6.00';
    point.firstSeenAt = '2024-03-03T00:00:00.000Z';
    await reconcileExogenousFactors('source', transaction);
    point.value = '5.25';
    point.firstSeenAt = '2024-03-04T00:00:00.000Z';
    point.retrievedAt = point.firstSeenAt;
    await reconcileExogenousFactors('source', transaction);
    expect(recorded.map((entry) => entry.payloadJson.value)).toEqual(['5.25', '6.00', '5.25']);
    expect(new Set(recorded.map((entry) => entry.payloadHash)).size).toBe(3);
    expect(SourceArtifactModel.create).toHaveBeenCalledTimes(1);
    expect(ClaimEvidenceModel.bulkCreate).toHaveBeenCalledTimes(3);
    expect(FactClaimModel.bulkCreate).toHaveBeenCalledWith(
      expect.arrayContaining([
        expect.objectContaining({ status: 'PUBLISHED', confidenceScore: null }),
      ]),
      { transaction },
    );
    expect(RawObservationModel.sequelize.query).toHaveBeenCalledWith(
      expect.stringContaining('pg_advisory_xact_lock'),
      { transaction },
    );

    series.licenseStatus = 'PENDING_REVIEW';
    await reconcileExogenousFactors('source', transaction);
    expect(FactClaimModel.bulkCreate).toHaveBeenLastCalledWith(
      expect.arrayContaining([expect.objectContaining({ status: 'PENDING_REVIEW' })]),
      { transaction },
    );
  });
});
