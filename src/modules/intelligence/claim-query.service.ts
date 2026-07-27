import { Injectable } from '@nestjs/common';
import type { Actor } from '../../common/auth/actor';
import { resolveDisclosureScope } from '../../common/auth/disclosure.policy';
import { ClaimQueryRepository, type ClaimRow } from './claim-query.repository';
import type { ClaimQueryInput } from './intelligence.schemas';

export interface ClaimView {
  readonly factClaimId: string;
  readonly claimType: string;
  readonly assertion: string;
  readonly eventDate: string | null;
  readonly status: string;
  readonly confidence: { level: string; score: number | null };
  readonly impactLevel: string | null;
  readonly timeHorizon: string | null;
  readonly producedBy: { agentCode: string; model: string; promptVersion: string };
  readonly economicEntityName: string | null;
  readonly evidence: unknown;
  readonly openContradictionCount: number;
  readonly createdAt: string;
}

@Injectable()
export class ClaimQueryService {
  constructor(private readonly repository: ClaimQueryRepository) {}

  async search(
    input: ClaimQueryInput,
    actor: Actor,
  ): Promise<{
    page: number;
    pageSize: number;
    total: number;
    items: readonly ClaimView[];
  }> {
    const { total, rows } = await this.repository.search(input, resolveDisclosureScope(actor));
    return {
      page: input.page,
      pageSize: input.pageSize,
      total,
      items: rows.map(toClaimView),
    };
  }
}

/**
 * Presents a claim as an attributed statement.
 *
 * The producing model and prompt version travel with the claim so a reader can
 * judge it, and never as a bare sentence that looks like an official figure.
 */
function toClaimView(row: ClaimRow): ClaimView {
  return {
    factClaimId: row.fact_claim_id,
    claimType: row.claim_type,
    assertion: row.assertion,
    eventDate: row.event_date,
    status: row.status,
    confidence: {
      level: row.confidence_level,
      score: row.confidence_score === null ? null : Number(row.confidence_score),
    },
    impactLevel: row.impact_level,
    timeHorizon: row.time_horizon,
    producedBy: {
      agentCode: row.agent_code,
      model: row.model_identifier,
      promptVersion: row.prompt_version,
    },
    economicEntityName: row.economic_entity_name,
    evidence: row.evidence,
    openContradictionCount: Number(row.open_contradiction_count),
    createdAt: row.created_at,
  };
}
