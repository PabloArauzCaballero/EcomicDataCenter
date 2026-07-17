import { CreationOptional, InferAttributes, InferCreationAttributes } from 'sequelize';
import { Column, DataType, Model, Table } from 'sequelize-typescript';

@Table({
  tableName: 'quality_dimension',
  schema: 'quality_lineage',
  timestamps: false,
  underscored: true,
})
export class QualityDimensionModel extends Model<
  InferAttributes<QualityDimensionModel>,
  InferCreationAttributes<QualityDimensionModel>
> {
  @Column({
    field: 'quality_dimension_id',
    type: DataType.UUID,
    allowNull: false,
    primaryKey: true,
    defaultValue: DataType.UUIDV4,
  })
  declare qualityDimensionId: CreationOptional<string>;

  @Column({ field: 'code', type: DataType.STRING(50), allowNull: false, unique: true })
  declare code: string;

  @Column({ field: 'name', type: DataType.STRING(180), allowNull: false })
  declare name: string;

  @Column({ field: 'description', type: DataType.TEXT, allowNull: true })
  declare description: string | null;
}
