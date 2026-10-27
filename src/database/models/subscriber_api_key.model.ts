import { CreationOptional, InferAttributes, InferCreationAttributes } from 'sequelize';
import { Column, DataType, Model, Table } from 'sequelize-typescript';

@Table({
  tableName: 'subscriber_api_key',
  schema: 'operations',
  timestamps: false,
  underscored: true,
})
export class SubscriberApiKeyModel extends Model<
  InferAttributes<SubscriberApiKeyModel>,
  InferCreationAttributes<SubscriberApiKeyModel>
> {
  @Column({
    field: 'subscriber_api_key_id',
    type: DataType.UUID,
    allowNull: false,
    primaryKey: true,
    defaultValue: DataType.UUIDV4,
  })
  declare subscriberApiKeyId: CreationOptional<string>;

  @Column({ field: 'subscriber_account_id', type: DataType.UUID, allowNull: false })
  declare subscriberAccountId: string;

  @Column({ field: 'key_prefix', type: DataType.TEXT, allowNull: false })
  declare keyPrefix: string;

  @Column({ field: 'key_hash', type: DataType.TEXT, allowNull: false, unique: true })
  declare keyHash: string;

  @Column({ field: 'label', type: DataType.TEXT, allowNull: false })
  declare label: string;

  @Column({ field: 'created_at', type: DataType.DATE, allowNull: false })
  declare createdAt: Date;

  @Column({ field: 'last_used_at', type: DataType.DATE, allowNull: true })
  declare lastUsedAt: Date | null;

  @Column({ field: 'revoked_at', type: DataType.DATE, allowNull: true })
  declare revokedAt: Date | null;
}
