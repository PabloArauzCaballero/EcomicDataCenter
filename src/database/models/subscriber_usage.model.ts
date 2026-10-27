import { CreationOptional, InferAttributes, InferCreationAttributes } from 'sequelize';
import { Column, DataType, Model, Table } from 'sequelize-typescript';

@Table({
  tableName: 'subscriber_usage',
  schema: 'operations',
  timestamps: false,
  underscored: true,
})
export class SubscriberUsageModel extends Model<
  InferAttributes<SubscriberUsageModel>,
  InferCreationAttributes<SubscriberUsageModel>
> {
  @Column({ field: 'subscriber_account_id', type: DataType.UUID, allowNull: false })
  declare subscriberAccountId: string;

  @Column({ field: 'period_month', type: DataType.DATEONLY, allowNull: false })
  declare periodMonth: string;

  @Column({ field: 'usage_kind', type: DataType.TEXT, allowNull: false })
  declare usageKind: string;

  @Column({ field: 'used', type: DataType.INTEGER, allowNull: false })
  declare used: number;
}
