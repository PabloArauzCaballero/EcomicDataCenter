import { Injectable } from '@nestjs/common';
import { randomUUID } from 'node:crypto';
import { Op, type CreationAttributes, type Transaction } from 'sequelize';
import { BusinessRuleError, NotFoundError } from '../../common/errors/application.error';
import {
  AgentRunModel,
  AiAgentModel,
  ClaimClusterMemberModel,
  ClaimEvidenceModel,
  DocumentClusterModel,
  DataContradictionModel,
  EntityAliasModel,
  EntityMentionModel,
  FactClaimModel,
  RawObservationModel,
  ReviewTaskModel,
  SourceArtifactModel,
} from '../../database/models';
import type { ClaimSubject } from '../../common/intelligence/claim-normalizer';
import type { AliasCandidate } from './entity-resolution';

@Injectable()
export class IntelligenceWriteRepository {
  async requireAgentByCode(code: string, transaction: Transaction): Promise<AiAgentModel> {
    const agent = await AiAgentModel.findOne({ where: { code }, transaction });
    if (!agent) throw new NotFoundError('ai_agent', code);
    if (agent.status !== 'ACTIVE') {
      throw new BusinessRuleError('The agent is not active', { code, status: agent.status });
    }
    return agent;
  }

  /**
   * Loads the agent that owns a run, which every isolation check needs.
   *
   * A missing row must fail rather than resolve to `undefined`: the caller uses
   * it to compare organizations, so an absent agent would silently skip that
   * comparison and turn a run identifier into a cross-institution capability.
   */
  async requireAgentById(aiAgentId: string, transaction: Transaction): Promise<AiAgentModel> {
    const agent = await AiAgentModel.findByPk(aiAgentId, { transaction });
    if (!agent) throw new NotFoundError('ai_agent', aiAgentId);
    return agent;
  }

  async requireRun(agentRunId: string, transaction: Transaction): Promise<AgentRunModel> {
    const run = await AgentRunModel.findByPk(agentRunId, { transaction });
    if (!run) throw new NotFoundError('agent_run', agentRunId);
    return run;
  }

  async requireOpenRun(agentRunId: string, transaction: Transaction): Promise<AgentRunModel> {
    const run = await this.requireRun(agentRunId, transaction);
    if (run.status !== 'RUNNING') {
      throw new BusinessRuleError('The agent run is already closed', {
        agentRunId,
        status: run.status,
      });
    }
    return run;
  }

  /** Confirms every cited artifact exists before any claim references it. */
  async assertArtifactsExist(
    sourceArtifactIds: readonly string[],
    transaction: Transaction,
  ): Promise<void> {
    const unique = [...new Set(sourceArtifactIds)];
    const found = await SourceArtifactModel.count({
      where: { sourceArtifactId: { [Op.in]: unique } },
      transaction,
    });
    if (found !== unique.length) {
      throw new BusinessRuleError('Evidence must reference a registered source artifact');
    }
  }

  /**
   * Stores the raw payload and reports whether it is a replay.
   *
   * The global lookup prevents a later run from inserting the same evidence
   * again. The surrounding SERIALIZABLE transaction protects concurrent runs,
   * while the unique (agent_run_id, payload_hash) constraint still protects a
   * retried request inside one run.
   */
  async claimRawObservation(
    values: { agentRunId: string; payloadHash: string; payload: Record<string, unknown> },
    transaction: Transaction,
  ): Promise<{ raw: RawObservationModel; created: boolean }> {
    const existing = await RawObservationModel.findOne({
      where: { payloadHash: values.payloadHash },
      order: [['rawObservationId', 'ASC']],
      transaction,
    });
    if (existing) return { raw: existing, created: false };
    const [raw, created] = await RawObservationModel.findOrCreate({
      where: { agentRunId: values.agentRunId, payloadHash: values.payloadHash },
      defaults: {
        agentRunId: values.agentRunId,
        sourceArtifactId: null,
        payloadJson: values.payload,
        payloadHash: values.payloadHash,
        receivedAt: new Date(),
        processingStatus: 'RECEIVED',
        rejectionReason: null,
        retryCount: 0,
        lastError: null,
        deadLetteredAt: null,
      },
      transaction,
    });
    return { raw, created };
  }

  async aliasCandidates(
    normalizedAliases: readonly string[],
    transaction: Transaction,
  ): Promise<readonly AliasCandidate[]> {
    if (normalizedAliases.length === 0) return [];
    const rows = await EntityAliasModel.findAll({
      where: { normalizedAlias: { [Op.in]: [...new Set(normalizedAliases)] } },
      transaction,
    });
    return rows.map((row) => ({
      economicEntityId: row.economicEntityId,
      normalizedAlias: row.normalizedAlias,
    }));
  }

  async createClaim(
    values: CreationAttributes<FactClaimModel>,
    transaction: Transaction,
  ): Promise<FactClaimModel> {
    return FactClaimModel.create(values, { transaction });
  }

  async createEvidence(
    rows: readonly CreationAttributes<ClaimEvidenceModel>[],
    transaction: Transaction,
  ): Promise<void> {
    await ClaimEvidenceModel.bulkCreate([...rows], { transaction });
  }

  async createMentions(
    rows: readonly CreationAttributes<EntityMentionModel>[],
    transaction: Transaction,
  ): Promise<void> {
    if (rows.length === 0) return;
    await EntityMentionModel.bulkCreate([...rows], { transaction });
  }

  /**
   * Finds published claims about the same subject that assert something else.
   *
   * Identical content hashes are excluded because those are corroboration, not
   * conflict; what remains is two trusted sources disagreeing, which the
   * datacenter must preserve rather than overwrite.
   */
  async findConflictingClaims(
    subject: ClaimSubject,
    contentHash: string,
    transaction: Transaction,
  ): Promise<readonly FactClaimModel[]> {
    return FactClaimModel.findAll({
      where: {
        status: 'PUBLISHED',
        claimType: { [Op.in]: ['FACT', 'INDICATOR_READING'] },
        contentHash: { [Op.ne]: contentHash },
        statisticalDomainId: subject.statisticalDomainId,
        geographicUnitId: subject.geographicUnitId,
        economicEntityId: subject.economicEntityId,
        eventDate: subject.eventDate,
      },
      limit: 25,
      transaction,
    });
  }

  async createContradictions(
    rows: readonly CreationAttributes<DataContradictionModel>[],
    transaction: Transaction,
  ): Promise<void> {
    if (rows.length === 0) return;
    await DataContradictionModel.bulkCreate([...rows], {
      transaction,
      ignoreDuplicates: true,
    });
  }

  /**
   * Attaches a claim to the cluster of stories that share its fingerprint.
   *
   * Nothing is deleted or merged: the cluster only records that several claims
   * describe the same event, so every original source and its evidence remain
   * independently auditable.
   */
  async attachToCluster(
    values: {
      fingerprint: string;
      factClaimId: string;
      assertion: string;
      similarityScore: number;
    },
    transaction: Transaction,
  ): Promise<{ documentClusterId: string; memberCount: number; isNewCluster: boolean }> {
    const now = new Date();
    const [cluster, created] = await DocumentClusterModel.findOrCreate({
      where: { clusterFingerprint: values.fingerprint },
      defaults: {
        documentClusterId: randomUUID(),
        representativeClaimId: values.factClaimId,
        clusterFingerprint: values.fingerprint,
        memberCount: 0,
        firstSeenAt: now,
        lastSeenAt: now,
      },
      transaction,
    });

    await ClaimClusterMemberModel.create(
      {
        documentClusterId: cluster.documentClusterId,
        factClaimId: values.factClaimId,
        similarity: String(values.similarityScore),
        joinedAt: now,
      },
      { transaction },
    );
    const memberCount = cluster.memberCount + 1;
    await cluster.update({ memberCount, lastSeenAt: now }, { transaction });
    return { documentClusterId: cluster.documentClusterId, memberCount, isNewCluster: created };
  }

  async createReviewTask(
    values: CreationAttributes<ReviewTaskModel>,
    transaction: Transaction,
  ): Promise<ReviewTaskModel> {
    return ReviewTaskModel.create(values, { transaction });
  }

  async requireReviewTask(
    reviewTaskId: string,
    transaction: Transaction,
  ): Promise<ReviewTaskModel> {
    const task = await ReviewTaskModel.findByPk(reviewTaskId, { transaction });
    if (!task) throw new NotFoundError('review_task', reviewTaskId);
    return task;
  }

  async requireClaim(factClaimId: string, transaction: Transaction): Promise<FactClaimModel> {
    const claim = await FactClaimModel.findByPk(factClaimId, { transaction });
    if (!claim) throw new NotFoundError('fact_claim', factClaimId);
    return claim;
  }

  async requireContradiction(
    dataContradictionId: string,
    transaction: Transaction,
  ): Promise<DataContradictionModel> {
    const contradiction = await DataContradictionModel.findByPk(dataContradictionId, {
      transaction,
    });
    if (!contradiction) throw new NotFoundError('data_contradiction', dataContradictionId);
    return contradiction;
  }
}
