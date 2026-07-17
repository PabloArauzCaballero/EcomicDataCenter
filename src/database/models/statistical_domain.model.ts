import { CreationOptional, InferAttributes, InferCreationAttributes } from 'sequelize';
import { Column, DataType, Model, Table } from 'sequelize-typescript';

@Table({ tableName: 'statistical_domain', schema: 'semantic', timestamps: false, underscored: true })
export class StatisticalDomainModel extends Model<
  InferAttributes<StatisticalDomainModel>,
  InferCreationAttributes<StatisticalDomainModel>
> {
  @Column({ field: 'statistical_domain_id', type: DataType.UUID, allowNull: false, primaryKey: true, defaultValue: DataType.UUIDV4 })
  declare statisticalDomainId: CreationOptional<string>;

  @Column({ field: 'parent_domain_id', type: DataType.UUID, allowNull: true })
  declare parentDomainId: string | null;

  @Column({ field: 'code', type: DataType.STRING(50), allowNull: false, unique: true })
  declare code: string;

  @Column({ field: 'name', type: DataType.STRING(180), allowNull: false })
  declare name: string;

  @Column({ field: 'description', type: DataType.TEXT, allowNull: true })
  declare description: string | null;

  @Column({ field: 'sort_order', type: DataType.INTEGER, allowNull: false })
  declare sortOrder: number;

  @Column({ field: 'is_active', type: DataType.BOOLEAN, allowNull: false })
  declare isActive: boolean;

}
