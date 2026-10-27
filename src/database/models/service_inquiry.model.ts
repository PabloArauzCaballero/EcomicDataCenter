import { CreationOptional, InferAttributes, InferCreationAttributes } from 'sequelize';
import { Column, DataType, Model, Table } from 'sequelize-typescript';

@Table({ tableName: 'service_inquiry', schema: 'operations', timestamps: false, underscored: true })
export class ServiceInquiryModel extends Model<
  InferAttributes<ServiceInquiryModel>,
  InferCreationAttributes<ServiceInquiryModel>
> {
  @Column({
    field: 'service_inquiry_id',
    type: DataType.UUID,
    allowNull: false,
    primaryKey: true,
    defaultValue: DataType.UUIDV4,
  })
  declare serviceInquiryId: CreationOptional<string>;

  @Column({ field: 'request_id', type: DataType.UUID, allowNull: false, unique: true })
  declare requestId: string;

  @Column({ field: 'full_name', type: DataType.TEXT, allowNull: false })
  declare fullName: string;

  @Column({ field: 'email', type: DataType.TEXT, allowNull: false })
  declare email: string;

  @Column({ field: 'organization', type: DataType.TEXT, allowNull: true })
  declare organization: string | null;

  @Column({ field: 'phone', type: DataType.TEXT, allowNull: true })
  declare phone: string | null;

  @Column({ field: 'plan_code', type: DataType.TEXT, allowNull: false })
  declare planCode: string;

  @Column({ field: 'message', type: DataType.TEXT, allowNull: false })
  declare message: string;

  @Column({ field: 'source_route', type: DataType.TEXT, allowNull: false })
  declare sourceRoute: string;

  @Column({ field: 'status', type: DataType.TEXT, allowNull: false })
  declare status: string;

  @Column({ field: 'operator_note', type: DataType.TEXT, allowNull: true })
  declare operatorNote: string | null;

  @Column({ field: 'created_at', type: DataType.DATE, allowNull: false })
  declare createdAt: Date;

  @Column({ field: 'updated_at', type: DataType.DATE, allowNull: true })
  declare updatedAt: Date | null;

  @Column({ field: 'updated_by', type: DataType.TEXT, allowNull: true })
  declare updatedBy: string | null;
}
