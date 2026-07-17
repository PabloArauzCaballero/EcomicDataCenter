import { CreationOptional, InferAttributes, InferCreationAttributes } from 'sequelize';
import { Column, DataType, Model, Table } from 'sequelize-typescript';

@Table({
  tableName: 'data_entry_batch',
  schema: 'provenance',
  timestamps: false,
  underscored: true,
})
export class DataEntryBatchModel extends Model<
  InferAttributes<DataEntryBatchModel>,
  InferCreationAttributes<DataEntryBatchModel>
> {
  @Column({
    field: 'data_entry_batch_id',
    type: DataType.UUID,
    allowNull: false,
    primaryKey: true,
    defaultValue: DataType.UUIDV4,
  })
  declare dataEntryBatchId: CreationOptional<string>;

  @Column({ field: 'dataset_version_id', type: DataType.UUID, allowNull: false })
  declare datasetVersionId: string;

  @Column({ field: 'source_artifact_id', type: DataType.UUID, allowNull: true })
  declare sourceArtifactId: string | null;

  @Column({ field: 'submitted_by_organization_id', type: DataType.UUID, allowNull: false })
  declare submittedByOrganizationId: string;

  @Column({ field: 'batch_code', type: DataType.STRING(80), allowNull: false, unique: true })
  declare batchCode: string;

  @Column({ field: 'entry_method', type: DataType.STRING(30), allowNull: false })
  declare entryMethod: string;

  @Column({ field: 'status', type: DataType.STRING(30), allowNull: false })
  declare status: string;

  @Column({ field: 'received_count', type: DataType.BIGINT, allowNull: false })
  declare receivedCount: string;

  @Column({ field: 'accepted_count', type: DataType.BIGINT, allowNull: false })
  declare acceptedCount: string;

  @Column({ field: 'rejected_count', type: DataType.BIGINT, allowNull: false })
  declare rejectedCount: string;

  @Column({ field: 'submitted_at', type: DataType.DATE, allowNull: false })
  declare submittedAt: Date;

  @Column({ field: 'started_at', type: DataType.DATE, allowNull: true })
  declare startedAt: Date | null;

  @Column({ field: 'completed_at', type: DataType.DATE, allowNull: true })
  declare completedAt: Date | null;

  @Column({ field: 'request_fingerprint', type: DataType.CHAR(64), allowNull: false })
  declare requestFingerprint: string;

  @Column({ field: 'result_json', type: DataType.JSONB, allowNull: true })
  declare resultJson: Record<string, unknown> | null;

  @Column({ field: 'notes', type: DataType.TEXT, allowNull: true })
  declare notes: string | null;
}
