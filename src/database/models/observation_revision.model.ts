import { CreationOptional, InferAttributes, InferCreationAttributes } from 'sequelize';
import { Column, DataType, Model, Table } from 'sequelize-typescript';

@Table({
  tableName: 'observation_revision',
  schema: 'statistics',
  timestamps: false,
  underscored: true,
})
export class ObservationRevisionModel extends Model<
  InferAttributes<ObservationRevisionModel>,
  InferCreationAttributes<ObservationRevisionModel>
> {
  @Column({
    field: 'observation_revision_id',
    type: DataType.BIGINT,
    allowNull: false,
    primaryKey: true,
    autoIncrement: true,
  })
  declare observationRevisionId: CreationOptional<string>;

  @Column({ field: 'observation_id', type: DataType.BIGINT, allowNull: false })
  declare observationId: string;

  @Column({ field: 'source_artifact_id', type: DataType.UUID, allowNull: false })
  declare sourceArtifactId: string;

  @Column({ field: 'data_entry_batch_id', type: DataType.UUID, allowNull: false })
  declare dataEntryBatchId: string;

  @Column({ field: 'revision_number', type: DataType.INTEGER, allowNull: false })
  declare revisionNumber: number;

  @Column({ field: 'status', type: DataType.STRING(30), allowNull: false })
  declare status: string;

  @Column({ field: 'confidentiality_status', type: DataType.STRING(30), allowNull: false })
  declare confidentialityStatus: string;

  @Column({ field: 'publication_date', type: DataType.DATEONLY, allowNull: true })
  declare publicationDate: string | null;

  @Column({ field: 'capture_date', type: DataType.DATE, allowNull: false })
  declare captureDate: Date;

  @Column({ field: 'vintage_date', type: DataType.DATEONLY, allowNull: false })
  declare vintageDate: string;

  @Column({ field: 'valid_from', type: DataType.DATE, allowNull: false })
  declare validFrom: Date;

  @Column({ field: 'valid_to', type: DataType.DATE, allowNull: true })
  declare validTo: Date | null;

  @Column({ field: 'is_current', type: DataType.BOOLEAN, allowNull: false })
  declare isCurrent: boolean;

  @Column({ field: 'revision_reason', type: DataType.TEXT, allowNull: true })
  declare revisionReason: string | null;

  @Column({ field: 'normalized_hash', type: DataType.CHAR(64), allowNull: false })
  declare normalizedHash: string;
}
