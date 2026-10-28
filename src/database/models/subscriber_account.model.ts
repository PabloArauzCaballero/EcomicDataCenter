import { CreationOptional, InferAttributes, InferCreationAttributes } from 'sequelize';
import { Column, DataType, Model, Table } from 'sequelize-typescript';

@Table({
  tableName: 'subscriber_account',
  schema: 'operations',
  timestamps: false,
  underscored: true,
})
export class SubscriberAccountModel extends Model<
  InferAttributes<SubscriberAccountModel>,
  InferCreationAttributes<SubscriberAccountModel>
> {
  @Column({
    field: 'subscriber_account_id',
    type: DataType.UUID,
    allowNull: false,
    primaryKey: true,
    defaultValue: DataType.UUIDV4,
  })
  declare subscriberAccountId: CreationOptional<string>;

  @Column({ field: 'email', type: DataType.TEXT, allowNull: false, unique: true })
  declare email: string;

  @Column({ field: 'full_name', type: DataType.TEXT, allowNull: false })
  declare fullName: string;

  @Column({ field: 'organization', type: DataType.TEXT, allowNull: true })
  declare organization: string | null;

  @Column({ field: 'legal_name', type: DataType.TEXT, allowNull: true })
  declare legalName: string | null;

  @Column({ field: 'tax_id', type: DataType.TEXT, allowNull: true })
  declare taxId: string | null;

  @Column({ field: 'plan_code', type: DataType.TEXT, allowNull: false })
  declare planCode: string;

  @Column({ field: 'billing_period', type: DataType.TEXT, allowNull: false })
  declare billingPeriod: string;

  @Column({ field: 'status', type: DataType.TEXT, allowNull: false })
  declare status: string;

  @Column({ field: 'paid_until', type: DataType.DATE, allowNull: true })
  declare paidUntil: Date | null;

  @Column({ field: 'password_hash', type: DataType.TEXT, allowNull: true })
  declare passwordHash: string | null;

  @Column({ field: 'terms_version', type: DataType.TEXT, allowNull: true })
  declare termsVersion: string | null;

  @Column({ field: 'terms_accepted_at', type: DataType.DATE, allowNull: true })
  declare termsAcceptedAt: Date | null;

  @Column({ field: 'service_inquiry_id', type: DataType.UUID, allowNull: true })
  declare serviceInquiryId: string | null;

  @Column({ field: 'created_at', type: DataType.DATE, allowNull: false })
  declare createdAt: Date;

  @Column({ field: 'updated_at', type: DataType.DATE, allowNull: false })
  declare updatedAt: Date;

  @Column({ field: 'failed_login_count', type: DataType.INTEGER, allowNull: false })
  declare failedLoginCount: number;

  @Column({ field: 'locked_until', type: DataType.DATE, allowNull: true })
  declare lockedUntil: Date | null;

  @Column({ field: 'session_version', type: DataType.INTEGER, allowNull: false })
  declare sessionVersion: number;
}
