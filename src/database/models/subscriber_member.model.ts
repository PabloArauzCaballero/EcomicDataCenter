import { CreationOptional, InferAttributes, InferCreationAttributes } from 'sequelize';
import { Column, DataType, Model, Table } from 'sequelize-typescript';

@Table({
  tableName: 'subscriber_member',
  schema: 'operations',
  timestamps: false,
  underscored: true,
})
export class SubscriberMemberModel extends Model<
  InferAttributes<SubscriberMemberModel>,
  InferCreationAttributes<SubscriberMemberModel>
> {
  @Column({
    field: 'subscriber_member_id',
    type: DataType.UUID,
    allowNull: false,
    primaryKey: true,
    defaultValue: DataType.UUIDV4,
  })
  declare subscriberMemberId: CreationOptional<string>;

  @Column({ field: 'subscriber_account_id', type: DataType.UUID, allowNull: false })
  declare subscriberAccountId: string;

  @Column({ field: 'email', type: DataType.TEXT, allowNull: false, unique: true })
  declare email: string;

  @Column({ field: 'full_name', type: DataType.TEXT, allowNull: false })
  declare fullName: string;

  @Column({ field: 'password_hash', type: DataType.TEXT, allowNull: true })
  declare passwordHash: string | null;

  @Column({ field: 'status', type: DataType.TEXT, allowNull: false })
  declare status: string;

  @Column({ field: 'session_version', type: DataType.INTEGER, allowNull: false })
  declare sessionVersion: number;

  @Column({ field: 'failed_login_count', type: DataType.INTEGER, allowNull: false })
  declare failedLoginCount: number;

  @Column({ field: 'locked_until', type: DataType.DATE, allowNull: true })
  declare lockedUntil: Date | null;

  @Column({ field: 'created_at', type: DataType.DATE, allowNull: false })
  declare createdAt: Date;
}
