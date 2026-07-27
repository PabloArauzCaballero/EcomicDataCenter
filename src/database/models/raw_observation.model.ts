import { CreationOptional, InferAttributes, InferCreationAttributes } from 'sequelize';
import { Column, DataType, Model, Table } from 'sequelize-typescript';

@Table({
  tableName: 'raw_observation',
  schema: 'intelligence',
  timestamps: false,
  underscored: true,
})
export class RawObservationModel extends Model<
  InferAttributes<RawObservationModel>,
  InferCreationAttributes<RawObservationModel>
> {
  @Column({
    field: 'raw_observation_id',
    type: DataType.BIGINT,
    allowNull: false,
    primaryKey: true,
    autoIncrement: true,
  })
  declare rawObservationId: CreationOptional<string>;

  @Column({ field: 'agent_run_id', type: DataType.UUID, allowNull: false })
  declare agentRunId: string;

  @Column({ field: 'source_artifact_id', type: DataType.UUID, allowNull: true })
  declare sourceArtifactId: string | null;

  @Column({ field: 'payload_json', type: DataType.JSONB, allowNull: false })
  declare payloadJson: Record<string, unknown>;

  @Column({ field: 'payload_hash', type: DataType.CHAR(64), allowNull: false })
  declare payloadHash: string;

  @Column({ field: 'received_at', type: DataType.DATE, allowNull: false })
  declare receivedAt: Date;

  @Column({ field: 'processing_status', type: DataType.STRING(30), allowNull: false })
  declare processingStatus: string;

  @Column({ field: 'rejection_reason', type: DataType.TEXT, allowNull: true })
  declare rejectionReason: string | null;

  @Column({ field: 'retry_count', type: DataType.INTEGER, allowNull: false })
  declare retryCount: number;

  @Column({ field: 'last_error', type: DataType.TEXT, allowNull: true })
  declare lastError: string | null;

  @Column({ field: 'dead_lettered_at', type: DataType.DATE, allowNull: true })
  declare deadLetteredAt: Date | null;
}
