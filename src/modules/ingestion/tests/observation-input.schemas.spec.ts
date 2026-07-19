import { observationRecordSchema } from '../observation-input.schemas';

const base = {
  frequencyId: '00000000-0000-4000-8000-000000000001',
  periodStart: '2026-01-01',
  periodEnd: '2026-01-31',
  periodCode: '2026-01',
  dimensions: [
    {
      dimensionDefinitionId: '00000000-0000-4000-8000-000000000002',
      textValue: 'Bolivia',
    },
  ],
  measures: [
    {
      measureDefinitionId: '00000000-0000-4000-8000-000000000003',
      numericValue: '100.5',
    },
  ],
  attributes: [],
  confidentialityStatus: 'PUBLIC',
  vintageDate: '2026-02-01',
};

describe('observationRecordSchema', () => {
  it('accepts one typed value per definition', () => {
    expect(observationRecordSchema.safeParse(base).success).toBe(true);
  });

  it('rejects two values in one dimension', () => {
    const invalid = {
      ...base,
      dimensions: [{ ...base.dimensions[0], numericValue: '1' }],
    };
    expect(observationRecordSchema.safeParse(invalid).success).toBe(false);
  });

  it('rejects a period whose end precedes its start', () => {
    expect(observationRecordSchema.safeParse({ ...base, periodEnd: '2025-12-31' }).success).toBe(
      false,
    );
  });
});
