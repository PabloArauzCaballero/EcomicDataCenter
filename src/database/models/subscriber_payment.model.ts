import { CreationOptional, InferAttributes, InferCreationAttributes } from 'sequelize';
import { Column, DataType, Model, Table } from 'sequelize-typescript';

@Table({
  tableName: 'subscriber_payment',
  schema: 'operations',
  timestamps: false,
  underscored: true,
})
export class SubscriberPaymentModel extends Model<
  InferAttributes<SubscriberPaymentModel>,
  InferCreationAttributes<SubscriberPaymentModel>
> {
  @Column({
    field: 'subscriber_payment_id',
    type: DataType.UUID,
    allowNull: false,
    primaryKey: true,
    defaultValue: DataType.UUIDV4,
  })
  declare subscriberPaymentId: CreationOptional<string>;

  @Column({ field: 'subscriber_account_id', type: DataType.UUID, allowNull: false })
  declare subscriberAccountId: string;

  @Column({ field: 'amount_bob', type: DataType.DECIMAL(12, 2), allowNull: false })
  declare amountBob: string;

  @Column({ field: 'covers_until', type: DataType.DATEONLY, allowNull: false })
  declare coversUntil: string;

  @Column({ field: 'reference', type: DataType.TEXT, allowNull: true })
  declare reference: string | null;

  @Column({ field: 'recorded_by', type: DataType.TEXT, allowNull: false })
  declare recordedBy: string;

  @Column({ field: 'recorded_at', type: DataType.DATE, allowNull: false })
  declare recordedAt: Date;
}
