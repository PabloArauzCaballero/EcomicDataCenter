import { CreationOptional, InferAttributes, InferCreationAttributes } from 'sequelize';
import { Column, DataType, Model, Table } from 'sequelize-typescript';

@Table({ tableName: 'ingestion_event', schema: 'operations', timestamps: false, underscored: true })
export class IngestionEventModel extends Model<
  InferAttributes<IngestionEventModel>,
  InferCreationAttributes<IngestionEventModel>
> {
  @Column({
    field: 'ingestion_event_id',
    type: DataType.BIGINT,
    allowNull: false,
    primaryKey: true,
    autoIncrement: true,
  })
  declare ingestionEventId: CreationOptional<string>;

  @Column({ field: 'correlation_id', type: DataType.STRING(128), allowNull: false })
  declare correlationId: string;

  @Column({ field: 'agent_run_id', type: DataType.UUID, allowNull: true })
  declare agentRunId: string | null;

  @Column({ field: 'source_id', type: DataType.UUID, allowNull: true })
  declare sourceId: string | null;

  @Column({ field: 'stage', type: DataType.STRING(30), allowNull: false })
  declare stage: string;

  @Column({ field: 'outcome', type: DataType.STRING(20), allowNull: false })
  declare outcome: string;

  @Column({ field: 'occurred_at', type: DataType.DATE, allowNull: false })
  declare occurredAt: Date;

  @Column({ field: 'duration_ms', type: DataType.INTEGER, allowNull: true })
  declare durationMs: number | null;

  @Column({ field: 'artifact_reference', type: DataType.STRING(500), allowNull: true })
  declare artifactReference: string | null;

  @Column({ field: 'artifact_sha256', type: DataType.CHAR(64), allowNull: true })
  declare artifactSha256: string | null;

  @Column({ field: 'records_received', type: DataType.BIGINT, allowNull: false })
  declare recordsReceived: string;

  @Column({ field: 'records_accepted', type: DataType.BIGINT, allowNull: false })
  declare recordsAccepted: string;

  @Column({ field: 'records_rejected', type: DataType.BIGINT, allowNull: false })
  declare recordsRejected: string;

  @Column({ field: 'records_skipped', type: DataType.BIGINT, allowNull: false })
  declare recordsSkipped: string;

  @Column({ field: 'reason', type: DataType.STRING(200), allowNull: true })
  declare reason: string | null;

  @Column({ field: 'details_json', type: DataType.JSONB, allowNull: true })
  declare detailsJson: Record<string, unknown> | null;
}
