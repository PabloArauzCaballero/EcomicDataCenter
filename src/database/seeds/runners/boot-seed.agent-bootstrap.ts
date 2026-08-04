import type { Transaction } from 'sequelize';
import { AiAgentModel, OrganizationModel, SourceModel } from '../../models';
import { agentBootstrapSeedSchema } from '../schemas/seed.schemas';
import { readSeed } from './seed.utils';

/**
 * Reconciles the identity an autonomous collector needs before it can write.
 *
 * Without these three rows a hosted agent cannot open a run, and every claim it
 * submits fails referential integrity because its evidence has no source to hang
 * an artifact on. Seeding them turns the daily-analysis contract into something
 * an operator can reach with the base URL alone instead of a manual bootstrap
 * that has to be repeated on every fresh database.
 */
export async function reconcileAgentBootstrap(transaction: Transaction): Promise<void> {
  const seed = await readSeed('boot/agent-bootstrap.json', agentBootstrapSeedSchema);
  const { organizationId } = seed.organization;

  await OrganizationModel.upsert({ ...seed.organization, validTo: null }, { transaction });
  await SourceModel.upsert({ ...seed.source, organizationId }, { transaction });
  await reconcileAgent(seed.agent, organizationId, transaction);
}

type AgentSeed = ReturnType<typeof agentBootstrapSeedSchema.parse>['agent'];

/**
 * Upserts the collector without touching its runtime columns.
 *
 * `last_run_at` and the credential fingerprint are written by the application,
 * not by the catalog, so a plain upsert would silently roll them back on every
 * deployment and make the agent look like it had never run.
 */
async function reconcileAgent(
  agent: AgentSeed,
  organizationId: string,
  transaction: Transaction,
): Promise<void> {
  const descriptive = {
    organizationId,
    name: agent.name,
    agentType: agent.agentType,
    provider: agent.provider,
    modelIdentifier: agent.modelIdentifier,
    specialty: agent.specialty,
    promptVersion: agent.promptVersion,
    schemaVersion: agent.schemaVersion,
    status: 'ACTIVE',
    isActive: true,
  };
  const existing = await AiAgentModel.findOne({ where: { code: agent.code }, transaction });
  if (existing) {
    await existing.update(descriptive, { transaction });
    return;
  }
  await AiAgentModel.create(
    {
      aiAgentId: agent.aiAgentId,
      code: agent.code,
      credentialFingerprint: null,
      configurationJson: {},
      lastRunAt: null,
      ...descriptive,
    },
    { transaction },
  );
}
