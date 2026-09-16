import { CreationOptional, InferAttributes, InferCreationAttributes } from 'sequelize';
import { Column, DataType, Model, Table } from 'sequelize-typescript';

@Table({ tableName: 'traffic_event', schema: 'operations', timestamps: false, underscored: true })
export class TrafficEventModel extends Model<
  InferAttributes<TrafficEventModel>,
  InferCreationAttributes<TrafficEventModel>
> {
  @Column({
    field: 'traffic_event_id',
    type: DataType.BIGINT,
    allowNull: false,
    primaryKey: true,
    autoIncrement: true,
  })
  declare trafficEventId: CreationOptional<string>;

  @Column({ field: 'event_key', type: DataType.STRING(64), allowNull: false, unique: true })
  declare eventKey: string;

  @Column({ field: 'occurred_at', type: DataType.DATE, allowNull: false })
  declare occurredAt: Date;

  @Column({ field: 'route', type: DataType.STRING(200), allowNull: false })
  declare route: string;

  @Column({ field: 'event_kind', type: DataType.STRING(20), allowNull: false })
  declare eventKind: string;

  @Column({ field: 'device_category', type: DataType.STRING(20), allowNull: false })
  declare deviceCategory: string;

  @Column({ field: 'referrer_category', type: DataType.STRING(20), allowNull: false })
  declare referrerCategory: string;

  @Column({ field: 'visitor_bucket', type: DataType.CHAR(16), allowNull: false })
  declare visitorBucket: string;

  @Column({ field: 'is_robot', type: DataType.BOOLEAN, allowNull: false })
  declare isRobot: boolean;
}
