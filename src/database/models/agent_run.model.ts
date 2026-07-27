import { CreationOptional, InferAttributes, InferCreationAttributes } from 'sequelize';
import { Column, DataType, Model, Table } from 'sequelize-typescript';

@Table({ tableName: 'agent_run', schema: 'intelligence', timestamps: false, underscored: true })
export class AgentRunModel extends Model<
  InferAttributes<AgentRunModel>,
  InferCreationAttributes<AgentRunModel>
> {
  @Column({
    field: 'agent_run_id',
    type: DataType.UUID,
    allowNull: false,
    primaryKey: true,
    defaultValue: DataType.UUIDV4,
  })
  declare agentRunId: CreationOptional<string>;

  @Column({ field: 'ai_agent_id', type: DataType.UUID, allowNull: false })
  declare aiAgentId: string;

  @Column({ field: 'correlation_id', type: DataType.STRING(128), allowNull: false })
  declare correlationId: string;

  @Column({ field: 'trigger_type', type: DataType.STRING(30), allowNull: false })
  declare triggerType: string;

  @Column({ field: 'attempt_no', type: DataType.INTEGER, allowNull: false })
  declare attemptNo: number;

  @Column({ field: 'status', type: DataType.STRING(30), allowNull: false })
  declare status: string;

  @Column({ field: 'started_at', type: DataType.DATE, allowNull: false })
  declare startedAt: Date;

  @Column({ field: 'completed_at', type: DataType.DATE, allowNull: true })
  declare completedAt: Date | null;

  @Column({ field: 'sources_consulted', type: DataType.INTEGER, allowNull: false })
  declare sourcesConsulted: number;

  @Column({ field: 'records_received', type: DataType.BIGINT, allowNull: false })
  declare recordsReceived: string;

  @Column({ field: 'records_accepted', type: DataType.BIGINT, allowNull: false })
  declare recordsAccepted: string;

  @Column({ field: 'records_rejected', type: DataType.BIGINT, allowNull: false })
  declare recordsRejected: string;

  @Column({ field: 'records_quarantined', type: DataType.BIGINT, allowNull: false })
  declare recordsQuarantined: string;

  @Column({ field: 'warning_count', type: DataType.INTEGER, allowNull: false })
  declare warningCount: number;

  @Column({ field: 'error_summary', type: DataType.TEXT, allowNull: true })
  declare errorSummary: string | null;

  @Column({ field: 'checkpoint_json', type: DataType.JSONB, allowNull: true })
  declare checkpointJson: Record<string, unknown> | null;

  @Column({ field: 'estimated_cost_usd', type: DataType.DECIMAL(12, 4), allowNull: true })
  declare estimatedCostUsd: string | null;

  @Column({ field: 'prompt_version', type: DataType.STRING(40), allowNull: false })
  declare promptVersion: string;

  @Column({ field: 'schema_version', type: DataType.STRING(40), allowNull: false })
  declare schemaVersion: string;
}
