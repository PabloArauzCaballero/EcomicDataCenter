import { CreationOptional, InferAttributes, InferCreationAttributes } from 'sequelize';
import { Column, DataType, Model, Table } from 'sequelize-typescript';

@Table({
  tableName: 'data_contradiction',
  schema: 'intelligence',
  timestamps: false,
  underscored: true,
})
export class DataContradictionModel extends Model<
  InferAttributes<DataContradictionModel>,
  InferCreationAttributes<DataContradictionModel>
> {
  @Column({
    field: 'data_contradiction_id',
    type: DataType.UUID,
    allowNull: false,
    primaryKey: true,
    defaultValue: DataType.UUIDV4,
  })
  declare dataContradictionId: CreationOptional<string>;

  @Column({ field: 'resolved_by_review_task_id', type: DataType.UUID, allowNull: true })
  declare resolvedByReviewTaskId: string | null;

  @Column({ field: 'subject_type', type: DataType.STRING(40), allowNull: false })
  declare subjectType: string;

  @Column({ field: 'primary_reference', type: DataType.STRING(80), allowNull: false })
  declare primaryReference: string;

  @Column({ field: 'contradicting_reference', type: DataType.STRING(80), allowNull: false })
  declare contradictingReference: string;

  @Column({ field: 'detection_method', type: DataType.STRING(40), allowNull: false })
  declare detectionMethod: string;

  @Column({ field: 'divergence_ratio', type: DataType.DECIMAL(12, 6), allowNull: true })
  declare divergenceRatio: string | null;

  @Column({ field: 'probable_cause', type: DataType.TEXT, allowNull: true })
  declare probableCause: string | null;

  @Column({ field: 'status', type: DataType.STRING(30), allowNull: false })
  declare status: string;

  @Column({ field: 'detected_at', type: DataType.DATE, allowNull: false })
  declare detectedAt: Date;

  @Column({ field: 'resolved_at', type: DataType.DATE, allowNull: true })
  declare resolvedAt: Date | null;

  @Column({ field: 'selected_reference', type: DataType.STRING(80), allowNull: true })
  declare selectedReference: string | null;

  @Column({ field: 'resolution_rationale', type: DataType.TEXT, allowNull: true })
  declare resolutionRationale: string | null;
}
