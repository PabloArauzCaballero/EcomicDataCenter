import { CreationOptional, InferAttributes, InferCreationAttributes } from 'sequelize';
import { Column, DataType, Model, Table } from 'sequelize-typescript';

@Table({
  tableName: 'dataset_indicator',
  schema: 'statistics',
  timestamps: false,
  underscored: true,
})
export class DatasetIndicatorModel extends Model<
  InferAttributes<DatasetIndicatorModel>,
  InferCreationAttributes<DatasetIndicatorModel>
> {
  @Column({
    field: 'dataset_indicator_id',
    type: DataType.UUID,
    allowNull: false,
    primaryKey: true,
    defaultValue: DataType.UUIDV4,
  })
  declare datasetIndicatorId: CreationOptional<string>;

  @Column({ field: 'dataset_version_id', type: DataType.UUID, allowNull: false })
  declare datasetVersionId: string;

  @Column({ field: 'indicator_version_id', type: DataType.UUID, allowNull: false })
  declare indicatorVersionId: string;

  @Column({ field: 'is_primary', type: DataType.BOOLEAN, allowNull: false })
  declare isPrimary: boolean;

  @Column({ field: 'sort_order', type: DataType.INTEGER, allowNull: false })
  declare sortOrder: number;
}
