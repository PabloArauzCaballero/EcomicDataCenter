import { CreationOptional, InferAttributes, InferCreationAttributes } from 'sequelize';
import { Column, DataType, Model, Table } from 'sequelize-typescript';

@Table({
  tableName: 'subscriber_token',
  schema: 'operations',
  timestamps: false,
  underscored: true,
})
export class SubscriberTokenModel extends Model<
  InferAttributes<SubscriberTokenModel>,
  InferCreationAttributes<SubscriberTokenModel>
> {
  @Column({ field: 'token_hash', type: DataType.TEXT, allowNull: false, primaryKey: true })
  declare tokenHash: CreationOptional<string>;

  @Column({ field: 'subscriber_account_id', type: DataType.UUID, allowNull: false })
  declare subscriberAccountId: string;

  @Column({ field: 'purpose', type: DataType.TEXT, allowNull: false })
  declare purpose: string;

  @Column({ field: 'expires_at', type: DataType.DATE, allowNull: false })
  declare expiresAt: Date;

  @Column({ field: 'used_at', type: DataType.DATE, allowNull: true })
  declare usedAt: Date | null;
}
