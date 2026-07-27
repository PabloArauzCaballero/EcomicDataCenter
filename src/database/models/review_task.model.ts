import { CreationOptional, InferAttributes, InferCreationAttributes } from 'sequelize';
import { Column, DataType, Model, Table } from 'sequelize-typescript';

@Table({ tableName: 'review_task', schema: 'intelligence', timestamps: false, underscored: true })
export class ReviewTaskModel extends Model<
  InferAttributes<ReviewTaskModel>,
  InferCreationAttributes<ReviewTaskModel>
> {
  @Column({
    field: 'review_task_id',
    type: DataType.UUID,
    allowNull: false,
    primaryKey: true,
    defaultValue: DataType.UUIDV4,
  })
  declare reviewTaskId: CreationOptional<string>;

  @Column({ field: 'target_type', type: DataType.STRING(40), allowNull: false })
  declare targetType: string;

  @Column({ field: 'target_reference', type: DataType.STRING(80), allowNull: false })
  declare targetReference: string;

  @Column({ field: 'reason', type: DataType.STRING(40), allowNull: false })
  declare reason: string;

  @Column({ field: 'priority', type: DataType.STRING(20), allowNull: false })
  declare priority: string;

  @Column({ field: 'status', type: DataType.STRING(30), allowNull: false })
  declare status: string;

  @Column({ field: 'assigned_to', type: DataType.STRING(120), allowNull: true })
  declare assignedTo: string | null;

  @Column({ field: 'decided_by', type: DataType.STRING(120), allowNull: true })
  declare decidedBy: string | null;

  @Column({ field: 'decision_rationale', type: DataType.TEXT, allowNull: true })
  declare decisionRationale: string | null;

  @Column({ field: 'created_at', type: DataType.DATE, allowNull: false })
  declare createdAt: Date;

  @Column({ field: 'resolved_at', type: DataType.DATE, allowNull: true })
  declare resolvedAt: Date | null;
}
