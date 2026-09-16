import { CreationOptional, InferAttributes, InferCreationAttributes } from 'sequelize';
import { Column, DataType, Model, Table } from 'sequelize-typescript';

@Table({ tableName: 'alert_delivery', schema: 'operations', timestamps: false, underscored: true })
export class AlertDeliveryModel extends Model<
  InferAttributes<AlertDeliveryModel>,
  InferCreationAttributes<AlertDeliveryModel>
> {
  @Column({
    field: 'alert_delivery_id',
    type: DataType.BIGINT,
    allowNull: false,
    primaryKey: true,
    autoIncrement: true,
  })
  declare alertDeliveryId: CreationOptional<string>;

  @Column({ field: 'health_incident_id', type: DataType.UUID, allowNull: true })
  declare healthIncidentId: string | null;

  @Column({ field: 'rule_code', type: DataType.STRING(60), allowNull: false })
  declare ruleCode: string;

  @Column({ field: 'dedup_key', type: DataType.STRING(160), allowNull: false })
  declare dedupKey: string;

  @Column({ field: 'channel', type: DataType.STRING(30), allowNull: false })
  declare channel: string;

  @Column({ field: 'attempt_no', type: DataType.INTEGER, allowNull: false })
  declare attemptNo: number;

  @Column({ field: 'status', type: DataType.STRING(20), allowNull: false })
  declare status: string;

  @Column({ field: 'dispatched_at', type: DataType.DATE, allowNull: false })
  declare dispatchedAt: Date;

  @Column({ field: 'error_summary', type: DataType.STRING(300), allowNull: true })
  declare errorSummary: string | null;
}
