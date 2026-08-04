import { Inject, Injectable } from '@nestjs/common';
import { randomUUID } from 'node:crypto';
import type { Sequelize } from 'sequelize';
import { AuditService } from '../../common/audit/audit.service';
import type { Actor } from '../../common/auth/actor';
import { assertActorOrganization } from '../../common/auth/organization-scope';
import { ConflictError } from '../../common/errors/application.error';
import { withSerializableRetry } from '../../common/persistence.transaction';
import { WRITER_DATABASE } from '../../database/database.tokens';
import { AgentRunModel, AiAgentModel } from '../../database/models';
import { AgentRunQueryRepository } from './agent-run-query.repository';
import type { AgentRunStatus } from './intelligence-results';
import { IntelligenceWriteRepository } from './intelligence-write.repository';
import type { OpenAgentRunInput, RegisterAgentInput } from './intelligence.schemas';

@Injectable()
export class AgentRegistryService {
  constructor(
    @Inject(WRITER_DATABASE) private readonly writer: Sequelize,
    private readonly repository: IntelligenceWriteRepository,
    private readonly runs: AgentRunQueryRepository,
    private readonly audit: AuditService,
  ) {}

  /**
   * Registers a collector.
   *
   * Credentials are never accepted here: the agent authenticates with a token
   * issued by the identity provider, and only a fingerprint of that credential
   * may later be stored for rotation tracking.
   */
  register(input: RegisterAgentInput, actor: Actor): Promise<{ aiAgentId: string; code: string }> {
    this.assertActorOrganization(actor, input.organizationId);
    return withSerializableRetry(this.writer, async (transaction) => {
      const existing = await AiAgentModel.findOne({ where: { code: input.code }, transaction });
      if (existing)
        throw new ConflictError('An agent already uses this code', { code: input.code });

      const agent = await AiAgentModel.create(
        {
          aiAgentId: randomUUID(),
          organizationId: input.organizationId,
          code: input.code,
          name: input.name,
          agentType: input.agentType,
          provider: input.provider,
          modelIdentifier: input.modelIdentifier,
          specialty: input.specialty ?? null,
          promptVersion: input.promptVersion,
          schemaVersion: input.schemaVersion,
          credentialFingerprint: null,
          configurationJson: input.configuration,
          status: 'ACTIVE',
          lastRunAt: null,
          isActive: true,
        },
        { transaction },
      );
      await this.audit.recordInTransaction(
        {
          action: 'intelligence.agent.registered',
          entityType: 'ai_agent',
          entityReference: agent.aiAgentId,
          details: { code: agent.code, provider: input.provider, model: input.modelIdentifier },
        },
        transaction,
      );
      return { aiAgentId: agent.aiAgentId, code: agent.code };
    });
  }

  /** Opens a run and returns the identifier every later submission must carry. */
  open(input: OpenAgentRunInput, actor: Actor, correlationId: string): Promise<AgentRunStatus> {
    return withSerializableRetry(this.writer, async (transaction) => {
      const agent = await this.repository.requireAgentByCode(input.agentCode, transaction);
      this.assertActorOrganization(actor, agent.organizationId);

      const run = await AgentRunModel.create(
        {
          agentRunId: randomUUID(),
          aiAgentId: agent.aiAgentId,
          correlationId,
          triggerType: input.triggerType,
          attemptNo: input.attemptNo,
          status: 'RUNNING',
          startedAt: new Date(),
          completedAt: null,
          sourcesConsulted: 0,
          recordsReceived: '0',
          recordsAccepted: '0',
          recordsRejected: '0',
          recordsQuarantined: '0',
          warningCount: 0,
          errorSummary: null,
          checkpointJson: null,
          estimatedCostUsd: null,
          promptVersion: input.promptVersion,
          schemaVersion: input.schemaVersion,
        },
        { transaction },
      );
      await agent.update({ lastRunAt: run.startedAt }, { transaction });
      await this.audit.recordInTransaction(
        {
          action: 'intelligence.agent-run.opened',
          entityType: 'agent_run',
          entityReference: run.agentRunId,
          details: { agentCode: agent.code, triggerType: input.triggerType },
        },
        transaction,
      );
      return this.toStatus(run, agent.code);
    });
  }

  /** Reports run progress so an agent can resume after a failure. */
  async status(agentRunId: string, actor: Actor): Promise<AgentRunStatus> {
    const run = await this.runs.requireStatus(agentRunId);
    // Institution-scoped roles (an ingestion agent) may only read their own
    // runs; unscoped custodian roles keep cross-institutional visibility, as
    // the disclosure policy grants them.
    this.assertActorOrganization(actor, run.organizationId);
    return run.status;
  }

  private toStatus(run: AgentRunModel, agentCode: string): AgentRunStatus {
    return {
      agentRunId: run.agentRunId,
      agentCode,
      status: run.status,
      startedAt: run.startedAt,
      completedAt: run.completedAt,
      recordsReceived: run.recordsReceived,
      recordsAccepted: run.recordsAccepted,
      recordsRejected: run.recordsRejected,
      recordsQuarantined: run.recordsQuarantined,
      correlationId: run.correlationId,
    };
  }

  private assertActorOrganization(actor: Actor, organizationId: string): void {
    assertActorOrganization(
      actor,
      organizationId,
      'Actor cannot operate agents of another organization',
    );
  }
}
