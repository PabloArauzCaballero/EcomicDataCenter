import { dataQuerySchema } from '../data-query.schemas';

const datasetVersionId = '6d21fc4a-fb95-4416-ae10-723b7d583c4a';

describe('dataQuerySchema', () => {
  it('applies bounded pagination defaults', () => {
    const result = dataQuerySchema.parse({ datasetVersionId });
    expect(result.page).toBe(1);
    expect(result.pageSize).toBe(50);
  });

  it('rejects an offset page that could create an excessive database scan', () => {
    expect(dataQuerySchema.safeParse({ datasetVersionId, page: 10_001 }).success).toBe(false);
  });
});
