import { CreationOptional, InferAttributes, InferCreationAttributes } from 'sequelize';
import { Column, DataType, Model, Table } from 'sequelize-typescript';

@Table({ tableName: 'indicator_relation', schema: 'quality_lineage', timestamps: false, underscored: true })
export class IndicatorRelationModel extends Model<
  InferAttributes<IndicatorRelationModel>,
  InferCreationAttributes<IndicatorRelationModel>
> {
  @Column({ field: 'indicator_relation_id', type: DataType.UUID, allowNull: false, primaryKey: true, defaultValue: DataType.UUIDV4 })
  declare indicatorRelationId: CreationOptional<string>;

  @Column({ field: 'source_indicator_version_id', type: DataType.UUID, allowNull: false })
  declare sourceIndicatorVersionId: string;

  @Column({ field: 'target_indicator_version_id', type: DataType.UUID, allowNull: false })
  declare targetIndicatorVersionId: string;

  @Column({ field: 'relation_type', type: DataType.STRING(40), allowNull: false })
  declare relationType: string;

  @Column({ field: 'formula', type: DataType.TEXT, allowNull: true })
  declare formula: string | null;

  @Column({ field: 'description', type: DataType.TEXT, allowNull: true })
  declare description: string | null;

  @Column({ field: 'valid_from', type: DataType.DATEONLY, allowNull: true })
  declare validFrom: string | null;

  @Column({ field: 'valid_to', type: DataType.DATEONLY, allowNull: true })
  declare validTo: string | null;

}
