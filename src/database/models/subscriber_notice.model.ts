import { CreationOptional, InferAttributes, InferCreationAttributes } from 'sequelize';
import { Column, DataType, Model, Table } from 'sequelize-typescript';

@Table({
  tableName: 'subscriber_notice',
  schema: 'operations',
  timestamps: false,
  underscored: true,
})
export class SubscriberNoticeModel extends Model<
  InferAttributes<SubscriberNoticeModel>,
  InferCreationAttributes<SubscriberNoticeModel>
> {
  @Column({
    field: 'subscriber_notice_id',
    type: DataType.UUID,
    allowNull: false,
    primaryKey: true,
    defaultValue: DataType.UUIDV4,
  })
  declare subscriberNoticeId: CreationOptional<string>;

  @Column({ field: 'subscriber_account_id', type: DataType.UUID, allowNull: false })
  declare subscriberAccountId: string;

  @Column({ field: 'kind', type: DataType.TEXT, allowNull: false })
  declare kind: string;

  @Column({ field: 'period_key', type: DataType.TEXT, allowNull: false })
  declare periodKey: string;

  @Column({ field: 'claimed_at', type: DataType.DATE, allowNull: false })
  declare claimedAt: Date;
}
