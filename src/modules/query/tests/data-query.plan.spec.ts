import { buildDataQueryPlan } from '../data-query.plan';
import { dataQuerySchema } from '../data-query.schemas';

const DATASET_VERSION_ID = '40000000-0000-4000-8000-000000000015';
const DIMENSION_ID = '40000000-0000-4000-8000-000000000012';
const CODE_ITEM_ID = '40000000-0000-4000-8000-000000000008';

describe('buildDataQueryPlan', () => {
  it('parameterizes dimension filters and pagination', () => {
    const input = dataQuerySchema.parse({
      datasetVersionId: DATASET_VERSION_ID,
      dimensions: [{ dimensionDefinitionId: DIMENSION_ID, codeItemId: CODE_ITEM_ID }],
      page: 2,
      pageSize: 25,
      sortDirection: 'desc',
    });
    const plan = buildDataQueryPlan(input);
    expect(plan.direction).toBe('DESC');
    expect(plan.replacements).toMatchObject({ limit: 25, offset: 25, dimensionValue0: CODE_ITEM_ID });
    expect(plan.predicates.join(' ')).toContain('filter_0.code_item_id = :dimensionValue0');
  });

  it('uses temporal validity for a vintage query', () => {
    const input = dataQuerySchema.parse({ datasetVersionId: DATASET_VERSION_ID, vintageDate: '2026-06-30' });
    const plan = buildDataQueryPlan(input);
    expect(plan.revisionPredicate).toContain('valid_from <= :vintageCutoff');
    expect(plan.replacements.vintageCutoff).toBe('2026-06-30T23:59:59.999Z');
  });
});
