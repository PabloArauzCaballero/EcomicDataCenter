import { CreationOptional, InferAttributes, InferCreationAttributes } from 'sequelize';
import { Column, DataType, Model, Table } from 'sequelize-typescript';

@Table({ tableName: 'ai_agent', schema: 'intelligence', timestamps: false, underscored: true })
export class AiAgentModel extends Model<
  InferAttributes<AiAgentModel>,
  InferCreationAttributes<AiAgentModel>
> {
  @Column({
    field: 'ai_agent_id',
    type: DataType.UUID,
    allowNull: false,
    primaryKey: true,
    defaultValue: DataType.UUIDV4,
  })
  declare aiAgentId: CreationOptional<string>;

  @Column({ field: 'organization_id', type: DataType.UUID, allowNull: false })
  declare organizationId: string;

  @Column({ field: 'code', type: DataType.STRING(80), allowNull: false, unique: true })
  declare code: string;

  @Column({ field: 'name', type: DataType.STRING(250), allowNull: false })
  declare name: string;

  @Column({ field: 'agent_type', type: DataType.STRING(40), allowNull: false })
  declare agentType: string;

  @Column({ field: 'provider', type: DataType.STRING(80), allowNull: false })
  declare provider: string;

  @Column({ field: 'model_identifier', type: DataType.STRING(120), allowNull: false })
  declare modelIdentifier: string;

  @Column({ field: 'specialty', type: DataType.STRING(120), allowNull: true })
  declare specialty: string | null;

  @Column({ field: 'prompt_version', type: DataType.STRING(40), allowNull: false })
  declare promptVersion: string;

  @Column({ field: 'schema_version', type: DataType.STRING(40), allowNull: false })
  declare schemaVersion: string;

  @Column({ field: 'credential_fingerprint', type: DataType.CHAR(64), allowNull: true })
  declare credentialFingerprint: string | null;

  @Column({ field: 'configuration_json', type: DataType.JSONB, allowNull: false })
  declare configurationJson: Record<string, unknown>;

  @Column({ field: 'status', type: DataType.STRING(30), allowNull: false })
  declare status: string;

  @Column({ field: 'last_run_at', type: DataType.DATE, allowNull: true })
  declare lastRunAt: Date | null;

  @Column({ field: 'is_active', type: DataType.BOOLEAN, allowNull: false })
  declare isActive: boolean;
}
