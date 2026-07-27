import { QueryTypes, type Sequelize } from 'sequelize';
import type { DisclosureScope } from '../../src/common/auth/disclosure.policy';
import { buildDataQueryPlan } from '../../src/modules/query/data-query.plan';
import { dataQuerySchema } from '../../src/modules/query/data-query.schemas';
import { encodeCursor } from '../../src/modules/query/pagination-cursor';
import { createIntegrationDatabase, describeIntegration } from './database.harness';

const DATASET_VERSION_ID = '40000000-0000-4000-8000-000000000015';
const ORGANIZATION_ID = '40000000-0000-4000-8000-000000000001';

const CUSTODIAN: DisclosureScope = { unrestricted: true, organizationId: null };
const SCOPED: DisclosureScope = { unrestricted: false, organizationId: ORGANIZATION_ID };
const ANONYMOUS: DisclosureScope = { unrestricted: false, organizationId: null };

/**
 * Proves the generated SQL is executable, not merely well-formed text.
 *
 * A plan can produce a predicate that references a missing join and still pass
 * every unit test, because unit tests never send the statement to PostgreSQL.
 * Each variant is executed here so that class of defect cannot ship.
 */
describeIntegration('generated query SQL', () => {
  let database: Sequelize;

  beforeAll(() => {
    database = createIntegrationDatabase();
  });

  afterAll(async () => {
    await database.close();
  });

  /** Runs the same shape the repository builds and returns the row count. */
  async function runPlan(
    input: Parameters<typeof buildDataQueryPlan>[0],
    scope: DisclosureScope,
  ): Promise<number> {
    const plan = buildDataQueryPlan(input, scope);
    const rows = await database.query<{ observation_id: string }>(
      `
SELECT o.observation_id
FROM statistics.observation o
JOIN statistics.series s ON s.series_id = o.series_id
JOIN LATERAL (
  SELECT candidate.*
  FROM statistics.observation_revision candidate
  WHERE candidate.observation_id = o.observation_id
    AND ${plan.revisionPredicate}
  ORDER BY candidate.valid_from DESC, candidate.revision_number DESC
  LIMIT 1
) r ON true
JOIN provenance.source_artifact artifact ON artifact.source_artifact_id = r.source_artifact_id
JOIN provenance.source source ON source.source_id = artifact.source_id
JOIN provenance.organization organization ON organization.organization_id = source.organization_id
JOIN metadata.dataset_version dataset_version
  ON dataset_version.dataset_version_id = s.dataset_version_id
JOIN metadata.dataset dataset_owner ON dataset_owner.dataset_id = dataset_version.dataset_id
WHERE ${plan.predicates.join('\n  AND ')}
ORDER BY o.period_start ${plan.direction}, s.series_key ASC
LIMIT :limit OFFSET :offset
      `,
      { replacements: plan.replacements, type: QueryTypes.SELECT },
    );
    return rows.length;
  }

  it('executes a custodian query that applies no disclosure filter', async () => {
    const input = dataQuerySchema.parse({ datasetVersionId: DATASET_VERSION_ID });
    await expect(runPlan(input, CUSTODIAN)).resolves.toBe(0);
  });

  it('executes an institution-scoped query, proving the dataset owner join exists', async () => {
    const input = dataQuerySchema.parse({ datasetVersionId: DATASET_VERSION_ID });
    await expect(runPlan(input, SCOPED)).resolves.toBe(0);
  });

  it('executes a public-only query for an actor without an organization', async () => {
    const input = dataQuerySchema.parse({ datasetVersionId: DATASET_VERSION_ID });
    await expect(runPlan(input, ANONYMOUS)).resolves.toBe(0);
  });

  it('executes a vintage query against the candidate alias', async () => {
    const input = dataQuerySchema.parse({
      datasetVersionId: DATASET_VERSION_ID,
      vintageDate: '2026-06-30',
    });
    await expect(runPlan(input, CUSTODIAN)).resolves.toBe(0);
  });

  it('executes a keyset page, proving the tuple comparison is valid SQL', async () => {
    const input = dataQuerySchema.parse({
      datasetVersionId: DATASET_VERSION_ID,
      cursor: encodeCursor({ periodStart: '2026-01-01', seriesKey: 'BO.CPI.M' }),
    });
    await expect(runPlan(input, CUSTODIAN)).resolves.toBe(0);
  });

  it('executes a descending keyset page', async () => {
    const input = dataQuerySchema.parse({
      datasetVersionId: DATASET_VERSION_ID,
      sortDirection: 'desc',
      cursor: encodeCursor({ periodStart: '2026-01-01', seriesKey: 'BO.CPI.M' }),
    });
    await expect(runPlan(input, CUSTODIAN)).resolves.toBe(0);
  });

  it('executes a dimension-filtered query', async () => {
    const input = dataQuerySchema.parse({
      datasetVersionId: DATASET_VERSION_ID,
      dimensions: [
        {
          dimensionDefinitionId: '40000000-0000-4000-8000-000000000012',
          codeItemId: '40000000-0000-4000-8000-000000000008',
        },
      ],
    });
    await expect(runPlan(input, SCOPED)).resolves.toBe(0);
  });

  it('executes the domain metrics collection statement', async () => {
    const rows = await database.query(
      `
SELECT
  (SELECT COUNT(*) FROM intelligence.data_contradiction
     WHERE status IN ('OPEN','UNDER_REVIEW')) AS open_contradictions,
  (SELECT COUNT(*) FROM intelligence.review_task
     WHERE status IN ('PENDING','IN_REVIEW')) AS pending_reviews,
  (SELECT COUNT(*) FROM intelligence.raw_observation
     WHERE processing_status = 'DEAD_LETTER') AS dead_letters,
  (SELECT COUNT(*) FROM provenance.source source
     WHERE source.is_active
       AND NOT EXISTS (
         SELECT 1 FROM provenance.source_artifact artifact
         WHERE artifact.source_id = source.source_id
           AND artifact.retrieved_at > now() - interval '48 hours'
       )) AS stale_sources,
  (SELECT EXTRACT(EPOCH FROM (now() - MAX(received_at)))
     FROM intelligence.raw_observation) AS ingestion_lag_seconds
      `,
      { type: QueryTypes.SELECT },
    );
    expect(rows).toHaveLength(1);
  });
});
