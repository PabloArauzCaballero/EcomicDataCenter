import { CreationOptional, InferAttributes, InferCreationAttributes } from 'sequelize';
import { Column, DataType, Model, Table } from 'sequelize-typescript';

@Table({
  tableName: 'quality_assessment',
  schema: 'quality_lineage',
  timestamps: false,
  underscored: true,
})
export class QualityAssessmentModel extends Model<
  InferAttributes<QualityAssessmentModel>,
  InferCreationAttributes<QualityAssessmentModel>
> {
  @Column({
    field: 'quality_assessment_id',
    type: DataType.BIGINT,
    allowNull: false,
    primaryKey: true,
    autoIncrement: true,
  })
  declare qualityAssessmentId: CreationOptional<string>;

  @Column({ field: 'quality_rule_id', type: DataType.UUID, allowNull: false })
  declare qualityRuleId: string;

  @Column({ field: 'data_entry_batch_id', type: DataType.UUID, allowNull: true })
  declare dataEntryBatchId: string | null;

  @Column({ field: 'target_entity_type', type: DataType.STRING(40), allowNull: false })
  declare targetEntityType: string;

  @Column({ field: 'target_entity_id', type: DataType.STRING(80), allowNull: false })
  declare targetEntityId: string;

  @Column({ field: 'status', type: DataType.STRING(20), allowNull: false })
  declare status: string;

  @Column({ field: 'measured_value', type: DataType.TEXT, allowNull: true })
  declare measuredValue: string | null;

  @Column({ field: 'threshold_value', type: DataType.TEXT, allowNull: true })
  declare thresholdValue: string | null;

  @Column({ field: 'details', type: DataType.JSONB, allowNull: false })
  declare details: Record<string, unknown>;

  @Column({ field: 'assessed_at', type: DataType.DATE, allowNull: false })
  declare assessedAt: Date;
}
