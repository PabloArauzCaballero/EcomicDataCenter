import type { Transaction } from 'sequelize';
import { RawObservationModel } from '../../../database/models';
import { IntelligenceWriteRepository } from '../intelligence-write.repository';

describe('IntelligenceWriteRepository.claimRawObservation', () => {
  afterEach(() => jest.restoreAllMocks());

  it('returns an existing payload from an earlier run without inserting it again', async () => {
    const existing = { rawObservationId: '42' } as RawObservationModel;
    const findOne = jest.spyOn(RawObservationModel, 'findOne').mockResolvedValue(existing);
    const findOrCreate = jest.spyOn(RawObservationModel, 'findOrCreate');
    const transaction = {} as Transaction;

    await expect(
      new IntelligenceWriteRepository().claimRawObservation(
        { agentRunId: 'new-run', payloadHash: 'a'.repeat(64), payload: { value: 1 } },
        transaction,
      ),
    ).resolves.toEqual({ raw: existing, created: false });
    expect(findOne).toHaveBeenCalledWith({
      where: { payloadHash: 'a'.repeat(64) },
      order: [['rawObservationId', 'ASC']],
      transaction,
    });
    expect(findOrCreate).not.toHaveBeenCalled();
  });
});
