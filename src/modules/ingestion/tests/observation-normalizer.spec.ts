import type { ObservationRecordInput } from '../observation-input.schemas';
import { buildRevisionHash, buildSeriesIdentity } from '../observation-normalizer';

const measureA = '00000000-0000-4000-8000-000000000001';
const measureB = '00000000-0000-4000-8000-000000000002';

function record(): ObservationRecordInput {
  return {
    frequencyId: '00000000-0000-4000-8000-000000000003',
    periodStart: '2026-01-01',
    periodEnd: '2026-01-31',
    periodCode: '2026-01',
    dimensions: [
      {
        dimensionDefinitionId: '00000000-0000-4000-8000-000000000004',
        textValue: 'Bolivia',
      },
    ],
    measures: [
      { measureDefinitionId: measureA, numericValue: '100.2500' },
      { measureDefinitionId: measureB, booleanValue: true },
    ],
    attributes: [],
    confidentialityStatus: 'PUBLIC',
    vintageDate: '2026-02-01',
  };
}

describe('observation normalizer', () => {
  it('builds the same revision hash regardless of measure order', () => {
    const first = record();
    const second = { ...first, measures: [...first.measures].reverse() };
    expect(buildRevisionHash(first)).toBe(buildRevisionHash(second));
  });

  it('changes the hash when a business value changes', () => {
    const first = record();
    const second = {
      ...first,
      measures: [{ measureDefinitionId: measureA, numericValue: '100.2600' }, first.measures[1]!],
    };
    expect(buildRevisionHash(first)).not.toBe(buildRevisionHash(second));
  });

  it('orders dimensions by structure position', () => {
    const identity = buildSeriesIdentity([
      {
        dimensionDefinitionId: '00000000-0000-4000-8000-000000000005',
        code: 'B',
        position: 2,
        textValue: 'second',
      },
      {
        dimensionDefinitionId: '00000000-0000-4000-8000-000000000004',
        code: 'A',
        position: 1,
        textValue: 'first',
      },
    ]);
    expect(identity.seriesKey).toBe('A=text:first|B=text:second');
    expect(identity.seriesKeyHash).toMatch(/^[a-f0-9]{64}$/);
  });
});
