import { Injectable } from '@nestjs/common';
import { QueryTypes } from 'sequelize';
import type { DisclosureScope } from '../../common/auth/disclosure.policy';
import { ReadQueryExecutor } from '../../common/persistence/read-query.executor';
import type { ClaimQueryInput } from './intelligence.schemas';

export interface ClaimRow {
  total_count: string;
  fact_claim_id: string;
  claim_type: string;
  assertion: string;
  event_date: string | null;
  status: string;
  confidence_level: string;
  confidence_score: string | null;
  impact_level: string | null;
  time_horizon: string | null;
  created_at: string;
  agent_code: string;
  model_identifier: string;
  prompt_version: string;
  economic_entity_name: string | null;
  evidence: unknown;
  open_contradiction_count: string;
}

@Injectable()
export class ClaimQueryRepository {
  constructor(private readonly executor: ReadQueryExecutor) {}

  /**
   * Returns claims with the evidence and producing agent attached.
   *
   * Provenance is joined rather than optional: an analyst must never receive an
   * assertion without being able to see which model produced it and which
   * excerpt supports it.
   */
  async search(
    input: ClaimQueryInput,
    scope: DisclosureScope,
  ): Promise<{ total: number; rows: readonly ClaimRow[] }> {
    const predicates = ['claim.status = :status'];
    const replacements: Record<string, unknown> = {
      status: input.status,
      limit: input.pageSize,
      offset: (input.page - 1) * input.pageSize,
    };
    for (const [field, column] of [
      ['claimType', 'claim.claim_type'],
      ['statisticalDomainId', 'claim.statistical_domain_id'],
      ['geographicUnitId', 'claim.geographic_unit_id'],
      ['economicEntityId', 'claim.economic_entity_id'],
    ] as const) {
      const value = input[field];
      if (value !== undefined) {
        predicates.push(`${column} = :${field}`);
        replacements[field] = value;
      }
    }

    // Only published claims are institutional output. Anything still in review,
    // rejected or superseded is working material of the producing organization
    // and must not reach another consumer of the datacenter.
    if (!scope.unrestricted && input.status !== 'PUBLISHED') {
      if (!scope.organizationId) return { total: 0, rows: [] };
      predicates.push('agent.organization_id = :scopeOrganizationId');
      replacements.scopeOrganizationId = scope.organizationId;
    }

    const rows = await this.executor.run(
      'intelligence.claims.search',
      ({ database, transaction }) =>
        database.query<ClaimRow>(
          `
SELECT
  COUNT(*) OVER() AS total_count,
  claim.fact_claim_id,
  claim.claim_type,
  claim.assertion,
  claim.event_date,
  claim.status,
  claim.confidence_level,
  claim.confidence_score,
  claim.impact_level,
  claim.time_horizon,
  claim.created_at,
  agent.code AS agent_code,
  agent.model_identifier,
  run.prompt_version,
  entity.legal_name AS economic_entity_name,
  COALESCE((
    SELECT jsonb_agg(jsonb_build_object(
      'sourceArtifactId', evidence.source_artifact_id,
      'excerpt', evidence.excerpt,
      'locator', evidence.locator,
      'retrievedAt', evidence.retrieved_at
    ) ORDER BY evidence.claim_evidence_id)
    FROM intelligence.claim_evidence evidence
    WHERE evidence.fact_claim_id = claim.fact_claim_id
  ), '[]'::jsonb) AS evidence,
  (
    SELECT COUNT(*) FROM intelligence.data_contradiction contradiction
    WHERE contradiction.subject_type = 'FACT_CLAIM'
      AND contradiction.status IN ('OPEN', 'UNDER_REVIEW')
      AND (
        contradiction.primary_reference = claim.fact_claim_id::text
        OR contradiction.contradicting_reference = claim.fact_claim_id::text
      )
  ) AS open_contradiction_count
FROM intelligence.fact_claim claim
JOIN intelligence.agent_run run ON run.agent_run_id = claim.agent_run_id
JOIN intelligence.ai_agent agent ON agent.ai_agent_id = run.ai_agent_id
LEFT JOIN intelligence.economic_entity entity
  ON entity.economic_entity_id = claim.economic_entity_id
WHERE ${predicates.join('\n  AND ')}
ORDER BY claim.created_at DESC, claim.fact_claim_id ASC
LIMIT :limit OFFSET :offset
      `,
          { replacements, type: QueryTypes.SELECT, transaction },
        ),
    );
    return { total: Number(rows[0]?.total_count ?? 0), rows };
  }
}
