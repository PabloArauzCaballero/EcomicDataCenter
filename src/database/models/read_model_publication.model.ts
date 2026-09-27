import { CreationOptional, InferAttributes, InferCreationAttributes } from 'sequelize';
import { Column, DataType, Model, Table } from 'sequelize-typescript';

@Table({
  tableName: 'read_model_publication',
  schema: 'operations',
  timestamps: false,
  underscored: true,
})
export class ReadModelPublicationModel extends Model<
  InferAttributes<ReadModelPublicationModel>,
  InferCreationAttributes<ReadModelPublicationModel>
> {
  @Column({
    field: 'read_model_publication_id',
    type: DataType.UUID,
    allowNull: false,
    primaryKey: true,
    defaultValue: DataType.UUIDV4,
  })
  declare readModelPublicationId: CreationOptional<string>;

  @Column({ field: 'dataset_code', type: DataType.STRING(80), allowNull: false, unique: true })
  declare datasetCode: string;

  @Column({ field: 'status', type: DataType.STRING(20), allowNull: false })
  declare status: string;

  @Column({ field: 'source_cutoff_at', type: DataType.DATE, allowNull: true })
  declare sourceCutoffAt: Date | null;

  @Column({ field: 'last_attempt_at', type: DataType.DATE, allowNull: true })
  declare lastAttemptAt: Date | null;

  @Column({ field: 'last_success_at', type: DataType.DATE, allowNull: true })
  declare lastSuccessAt: Date | null;

  @Column({ field: 'last_error', type: DataType.STRING(500), allowNull: true })
  declare lastError: string | null;
}
