import type { DisclosureScope } from '../../../common/auth/disclosure.policy';
import { buildDataQueryPlan } from '../data-query.plan';
import { dataQuerySchema } from '../data-query.schemas';
import { encodeCursor } from '../pagination-cursor';

const CUSTODIAN: DisclosureScope = { unrestricted: true, organizationId: null };
const ORGANIZATION_ID = '40000000-0000-4000-8000-000000000001';
const SCOPED: DisclosureScope = { unrestricted: false, organizationId: ORGANIZATION_ID };
const ANONYMOUS: DisclosureScope = { unrestricted: false, organizationId: null };

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
    const plan = buildDataQueryPlan(input, CUSTODIAN);
    expect(plan.direction).toBe('DESC');
    expect(plan.replacements).toMatchObject({
      limit: 25,
      offset: 25,
      dimensionValue0: CODE_ITEM_ID,
    });
    expect(plan.predicates.join(' ')).toContain('filter_0.code_item_id = :dimensionValue0');
  });

  it('uses temporal validity for a vintage query', () => {
    const input = dataQuerySchema.parse({
      datasetVersionId: DATASET_VERSION_ID,
      vintageDate: '2026-06-30',
    });
    const plan = buildDataQueryPlan(input, CUSTODIAN);
    expect(plan.revisionPredicate).toContain('valid_from <= :vintageCutoff');
    expect(plan.replacements.vintageCutoff).toBe('2026-06-30T23:59:59.999Z');
  });

  it('adds no disclosure predicate for a national custodian', () => {
    const input = dataQuerySchema.parse({ datasetVersionId: DATASET_VERSION_ID });
    const plan = buildDataQueryPlan(input, CUSTODIAN);
    expect(plan.predicates.join(' ')).not.toContain('confidentiality_status');
  });

  it('lets an institution read public records or its own restricted records', () => {
    const input = dataQuerySchema.parse({ datasetVersionId: DATASET_VERSION_ID });
    const plan = buildDataQueryPlan(input, SCOPED);
    const predicates = plan.predicates.join(' ');
    expect(predicates).toContain('r.confidentiality_status IN (:publicConfidentiality)');
    expect(predicates).toContain('dataset_owner.producer_organization_id = :scopeOrganizationId');
    expect(plan.replacements.scopeOrganizationId).toBe(ORGANIZATION_ID);
  });

  it('restricts an actor without an organization to public records only', () => {
    const input = dataQuerySchema.parse({ datasetVersionId: DATASET_VERSION_ID });
    const plan = buildDataQueryPlan(input, ANONYMOUS);
    const predicates = plan.predicates.join(' ');
    expect(predicates).toContain('r.confidentiality_status IN (:publicConfidentiality)');
    expect(predicates).not.toContain('scopeOrganizationId');
  });

  it('builds the revision predicate against the explicit candidate alias', () => {
    const input = dataQuerySchema.parse({ datasetVersionId: DATASET_VERSION_ID });
    const plan = buildDataQueryPlan(input, CUSTODIAN);
    expect(plan.revisionPredicate).toContain('candidate.status');
    expect(plan.revisionPredicate).not.toContain('r.');
  });

  it('advances an ascending keyset page with the ordered tuple comparison', () => {
    const input = dataQuerySchema.parse({
      datasetVersionId: DATASET_VERSION_ID,
      cursor: encodeCursor({ periodStart: '2026-01-01', seriesKey: 'B' }),
      sortDirection: 'asc',
    });
    const plan = buildDataQueryPlan(input, CUSTODIAN);
    expect(plan.keyset).toBe(true);
    expect(plan.replacements.offset).toBe(0);
    expect(plan.predicates.join(' ')).toContain(
      '(o.period_start, s.series_key) > (:cursorPeriodStart::date, :cursorSeriesKey)',
    );
  });

  // The page is emitted as `period_start DESC, series_key ASC`. A symmetric
  // tuple comparison would ask for `series_key <` on the ties, re-serving rows
  // already returned and skipping the rest of the tie group.
  it('keeps the ascending tie-breaker on a descending keyset page', () => {
    const input = dataQuerySchema.parse({
      datasetVersionId: DATASET_VERSION_ID,
      cursor: encodeCursor({ periodStart: '2026-01-01', seriesKey: 'B' }),
      sortDirection: 'desc',
    });
    const plan = buildDataQueryPlan(input, CUSTODIAN);
    const predicates = plan.predicates.join(' ');
    expect(predicates).toContain('o.period_start < :cursorPeriodStart::date');
    expect(predicates).toContain(
      'o.period_start = :cursorPeriodStart::date AND s.series_key > :cursorSeriesKey',
    );
    expect(predicates).not.toContain('s.series_key < :cursorSeriesKey');
  });
});
