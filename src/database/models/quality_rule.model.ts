import { CreationOptional, InferAttributes, InferCreationAttributes } from 'sequelize';
import { Column, DataType, Model, Table } from 'sequelize-typescript';

@Table({ tableName: 'quality_rule', schema: 'quality_lineage', timestamps: false, underscored: true })
export class QualityRuleModel extends Model<
  InferAttributes<QualityRuleModel>,
  InferCreationAttributes<QualityRuleModel>
> {
  @Column({ field: 'quality_rule_id', type: DataType.UUID, allowNull: false, primaryKey: true, defaultValue: DataType.UUIDV4 })
  declare qualityRuleId: CreationOptional<string>;

  @Column({ field: 'quality_dimension_id', type: DataType.UUID, allowNull: false })
  declare qualityDimensionId: string;

  @Column({ field: 'code', type: DataType.STRING(80), allowNull: false, unique: true })
  declare code: string;

  @Column({ field: 'name', type: DataType.STRING(250), allowNull: false })
  declare name: string;

  @Column({ field: 'rule_type', type: DataType.STRING(40), allowNull: false })
  declare ruleType: string;

  @Column({ field: 'severity', type: DataType.STRING(20), allowNull: false })
  declare severity: string;

  @Column({ field: 'target_entity_type', type: DataType.STRING(40), allowNull: false })
  declare targetEntityType: string;

  @Column({ field: 'configuration_json', type: DataType.JSONB, allowNull: false })
  declare configurationJson: Record<string, unknown>;

  @Column({ field: 'is_active', type: DataType.BOOLEAN, allowNull: false })
  declare isActive: boolean;

}
