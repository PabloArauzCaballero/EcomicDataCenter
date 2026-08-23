import { Injectable } from '@nestjs/common';
import { randomUUID } from 'node:crypto';
import type { Transaction } from 'sequelize';
import { RawObservationModel } from '../../database/models';
import {
  claimContentHash,
  claimSubject,
  evidenceHash,
  isComparableSubject,
} from '../../common/intelligence/claim-normalizer';
import { ClaimTriageService } from './claim-triage.service';
import { IntelligenceWriteRepository } from './intelligence-write.repository';
import type { SubmissionItemResult } from './intelligence-results';
import type { SubmissionItemInput } from './intelligence.schemas';
import { routeClaim } from './review-routing.policy';

interface PersistClaimInput {
  readonly index: number;
  readonly item: SubmissionItemInput;
  readonly agentRunId: string;
  readonly rawObservationId: string;
  readonly correlationId: string;
}

@Injectable()
export class ClaimPersistenceService {
  constructor(
    private readonly repository: IntelligenceWriteRepository,
    private readonly triage: ClaimTriageService,
  ) {}

  /**
   * Turns one validated submission into a claim with evidence and mentions.
   *
   * The routing policy decides the initial status. Nothing reaches PUBLISHED
   * without passing that policy, and the database additionally refuses a
   * published claim that carries no evidence.
   */
  async persist(input: PersistClaimInput, transaction: Transaction): Promise<SubmissionItemResult> {
    const { claim } = input.item;
    const decision = routeClaim({
      claimType: claim.claimType,
      assertion: claim.assertion,
      confidenceLevel: claim.confidenceLevel,
      impactLevel: claim.impactLevel,
      evidenceExcerpts: claim.evidence.map((piece) => piece.excerpt),
    });

    if (decision.disposition === 'QUARANTINE') {
      await this.markRaw(input.rawObservationId, 'QUARANTINED', decision.explanation, transaction);
      return {
        index: input.index,
        outcome: 'QUARANTINED',
        rawObservationId: input.rawObservationId,
        explanation: decision.explanation,
      };
    }

    const mentions = await this.triage.resolveMentions(claim.entityMentions, transaction);
    const primaryEntityId = mentions.find((mention) => mention.economicEntityId)?.economicEntityId;
    const content = {
      claimType: claim.claimType,
      assertion: claim.assertion,
      eventDate: claim.eventDate,
      statisticalDomainId: claim.statisticalDomainId,
      geographicUnitId: claim.geographicUnitId,
      economicEntityId: primaryEntityId ?? null,
    };
    const contentHash = claimContentHash(content);
    const subject = claimSubject(content);
    const conflicts = isComparableSubject(subject)
      ? await this.repository.findConflictingClaims(subject, contentHash, transaction)
      : [];

    const requiresReview = decision.disposition === 'REVIEW' || conflicts.length > 0;
    const status = requiresReview ? 'PENDING_REVIEW' : 'PUBLISHED';
    const factClaimId = randomUUID();

    await this.repository.createClaim(
      {
        factClaimId,
        agentRunId: input.agentRunId,
        rawObservationId: input.rawObservationId,
        statisticalDomainId: claim.statisticalDomainId ?? null,
        geographicUnitId: claim.geographicUnitId ?? null,
        economicEntityId: primaryEntityId ?? null,
        supersededByClaimId: null,
        claimType: claim.claimType,
        assertion: claim.assertion,
        eventDate: claim.eventDate ?? null,
        publishedAt: claim.publishedAt ?? null,
        timeHorizon: claim.timeHorizon ?? null,
        impactLevel: claim.impactLevel ?? null,
        probability: claim.probability === undefined ? null : String(claim.probability),
        confidenceLevel: claim.confidenceLevel,
        confidenceScore: claim.confidenceScore === undefined ? null : String(claim.confidenceScore),
        status,
        contentHash,
        createdAt: new Date(),
      },
      transaction,
    );

    await this.repository.createEvidence(
      claim.evidence.map((piece) => ({
        factClaimId,
        sourceArtifactId: piece.sourceArtifactId,
        excerpt: piece.excerpt,
        excerptHash: evidenceHash(piece.excerpt),
        locator: piece.locator ?? null,
        retrievedAt: piece.retrievedAt,
      })),
      transaction,
    );

    await this.repository.createMentions(
      mentions.map((mention) => ({
        factClaimId,
        economicEntityId: mention.economicEntityId,
        mentionText: mention.mentionText,
        resolutionMethod: mention.method,
        resolutionConfidence: mention.confidence === null ? null : String(mention.confidence),
      })),
      transaction,
    );

    const cluster = await this.triage.clusterClaim(factClaimId, claim.assertion, transaction);
    const contradictionIds = await this.triage.recordContradictions(
      factClaimId,
      conflicts,
      transaction,
    );
    const reviewTaskId = requiresReview
      ? await this.triage.openReview(factClaimId, conflicts.length > 0, decision, transaction)
      : undefined;

    await this.markRaw(input.rawObservationId, 'NORMALIZED', null, transaction);

    return {
      index: input.index,
      outcome: requiresReview ? 'PENDING_REVIEW' : 'PUBLISHED',
      rawObservationId: input.rawObservationId,
      factClaimId,
      ...(reviewTaskId ? { reviewTaskId } : {}),
      ...(contradictionIds.length ? { contradictionIds } : {}),
      ...(cluster.memberCount > 1
        ? {
            duplicateOfClusterId: cluster.documentClusterId,
            clusterMemberCount: cluster.memberCount,
          }
        : {}),
      unresolvedMentions: mentions
        .filter((mention) => mention.method === 'UNRESOLVED')
        .map((mention) => mention.mentionText),
      explanation: decision.explanation,
    };
  }

  private async markRaw(
    rawObservationId: string,
    status: string,
    reason: string | null,
    transaction: Transaction,
  ): Promise<void> {
    await RawObservationModel.update(
      { processingStatus: status, rejectionReason: reason },
      { where: { rawObservationId }, transaction },
    );
  }
}
