import { Injectable } from '@nestjs/common';
import { randomUUID } from 'node:crypto';
import type { Transaction } from 'sequelize';
import { MetricsService } from '../../common/observability/metrics.service';
import { clusterFingerprint, shingles, similarity } from './document-similarity';
import { normalizeEntityName, resolveMention } from './entity-resolution';
import { IntelligenceWriteRepository } from './intelligence-write.repository';

/** Urgency of a review task, derived from why the claim was held back. */
const REVIEW_PRIORITY_BY_REASON: Readonly<Record<string, string>> = {
  CRITICAL_CLAIM: 'URGENT',
  CONTRADICTION: 'HIGH',
  AI_INFERENCE: 'NORMAL',
  LOW_CONFIDENCE: 'NORMAL',
  MANUAL_REQUEST: 'NORMAL',
};

export interface ResolvedMention {
  readonly mentionText: string;
  readonly economicEntityId: string | null;
  readonly method: 'EXACT_ALIAS' | 'NORMALIZED_ALIAS' | 'UNRESOLVED';
  readonly confidence: number | null;
}

export interface ClusterOutcome {
  readonly documentClusterId: string;
  readonly memberCount: number;
}

/**
 * Everything that happens to a claim besides storing it.
 *
 * Clustering, entity resolution, contradiction recording and review routing all
 * answer the same question — how this claim relates to what the datacenter
 * already knows — so they live together and leave persistence to its own service.
 */
@Injectable()
export class ClaimTriageService {
  constructor(
    private readonly repository: IntelligenceWriteRepository,
    private readonly metrics: MetricsService,
  ) {}

  /**
   * Links the claim to other reports of the same story.
   *
   * The fingerprint buckets candidates so this stays a lookup rather than a
   * scan, and the recorded similarity lets an analyst see how close the match
   * was instead of trusting an opaque merge.
   */
  async clusterClaim(
    factClaimId: string,
    assertion: string,
    transaction: Transaction,
  ): Promise<ClusterOutcome> {
    const fingerprint = clusterFingerprint(assertion);
    const selfSimilarity = similarity(shingles(assertion), shingles(assertion));
    const result = await this.repository.attachToCluster(
      { fingerprint, factClaimId, assertion, similarityScore: selfSimilarity },
      transaction,
    );
    if (result.memberCount > 1) this.metrics.observeIntelligence('claim', 'duplicate');
    return { documentClusterId: result.documentClusterId, memberCount: result.memberCount };
  }

  /** Matches every mention against the known aliases of economic entities. */
  async resolveMentions(
    mentionTexts: readonly string[],
    transaction: Transaction,
  ): Promise<readonly ResolvedMention[]> {
    if (mentionTexts.length === 0) return [];
    const normalized = mentionTexts.map(normalizeEntityName);
    const candidates = await this.repository.aliasCandidates(normalized, transaction);
    return mentionTexts.map((mentionText) => ({
      mentionText,
      ...resolveMention(mentionText, candidates),
    }));
  }

  /** Records that a new claim disagrees with claims already published. */
  async recordContradictions(
    factClaimId: string,
    conflicts: readonly { factClaimId: string }[],
    transaction: Transaction,
  ): Promise<readonly string[]> {
    if (conflicts.length === 0) return [];
    const rows = conflicts.map((conflict) => ({
      dataContradictionId: randomUUID(),
      resolvedByReviewTaskId: null,
      subjectType: 'FACT_CLAIM',
      primaryReference: conflict.factClaimId,
      contradictingReference: factClaimId,
      detectionMethod: 'CONFLICTING_ASSERTION',
      divergenceRatio: null,
      probableCause: 'Two sources assert different content about the same subject and date',
      status: 'OPEN',
      detectedAt: new Date(),
      resolvedAt: null,
      selectedReference: null,
      resolutionRationale: null,
    }));
    await this.repository.createContradictions(rows, transaction);
    this.metrics.observeIntelligence('contradiction', 'opened', rows.length);
    return rows.map((row) => row.dataContradictionId);
  }

  /** Opens the human decision a claim needs before it may be published. */
  async openReview(
    factClaimId: string,
    hasContradiction: boolean,
    decision: { reason: string; explanation: string },
    transaction: Transaction,
  ): Promise<string> {
    const reason = hasContradiction ? 'CONTRADICTION' : decision.reason;
    const task = await this.repository.createReviewTask(
      {
        reviewTaskId: randomUUID(),
        targetType: 'FACT_CLAIM',
        targetReference: factClaimId,
        reason,
        priority: REVIEW_PRIORITY_BY_REASON[reason] ?? 'NORMAL',
        status: 'PENDING',
        assignedTo: null,
        decidedBy: null,
        decisionRationale: null,
        createdAt: new Date(),
        resolvedAt: null,
      },
      transaction,
    );
    this.metrics.observeIntelligence('review', 'opened');
    return task.reviewTaskId;
  }
}
