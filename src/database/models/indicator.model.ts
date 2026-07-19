import { CreationOptional, InferAttributes, InferCreationAttributes } from 'sequelize';
import { Column, DataType, Model, Table } from 'sequelize-typescript';

@Table({ tableName: 'indicator', schema: 'statistics', timestamps: false, underscored: true })
export class IndicatorModel extends Model<
  InferAttributes<IndicatorModel>,
  InferCreationAttributes<IndicatorModel>
> {
  @Column({
    field: 'indicator_id',
    type: DataType.UUID,
    allowNull: false,
    primaryKey: true,
    defaultValue: DataType.UUIDV4,
  })
  declare indicatorId: CreationOptional<string>;

  @Column({ field: 'statistical_domain_id', type: DataType.UUID, allowNull: false })
  declare statisticalDomainId: string;

  @Column({ field: 'owner_organization_id', type: DataType.UUID, allowNull: false })
  declare ownerOrganizationId: string;

  @Column({ field: 'code', type: DataType.STRING(80), allowNull: false })
  declare code: string;

  @Column({ field: 'name', type: DataType.STRING(250), allowNull: false })
  declare name: string;

  @Column({ field: 'short_name', type: DataType.STRING(120), allowNull: true })
  declare shortName: string | null;

  @Column({ field: 'definition', type: DataType.TEXT, allowNull: false })
  declare definition: string;

  @Column({ field: 'indicator_type', type: DataType.STRING(40), allowNull: false })
  declare indicatorType: string;

  @Column({ field: 'data_nature', type: DataType.STRING(40), allowNull: false })
  declare dataNature: string;

  @Column({ field: 'preferred_direction', type: DataType.STRING(20), allowNull: true })
  declare preferredDirection: string | null;

  @Column({ field: 'is_active', type: DataType.BOOLEAN, allowNull: false })
  declare isActive: boolean;
}
