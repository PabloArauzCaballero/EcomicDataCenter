import { CreationOptional, InferAttributes, InferCreationAttributes } from 'sequelize';
import { Column, DataType, Model, Table } from 'sequelize-typescript';

@Table({ tableName: 'methodology', schema: 'metadata', timestamps: false, underscored: true })
export class MethodologyModel extends Model<
  InferAttributes<MethodologyModel>,
  InferCreationAttributes<MethodologyModel>
> {
  @Column({
    field: 'methodology_id',
    type: DataType.UUID,
    allowNull: false,
    primaryKey: true,
    defaultValue: DataType.UUIDV4,
  })
  declare methodologyId: CreationOptional<string>;

  @Column({ field: 'owner_organization_id', type: DataType.UUID, allowNull: false })
  declare ownerOrganizationId: string;

  @Column({ field: 'code', type: DataType.STRING(80), allowNull: false })
  declare code: string;

  @Column({ field: 'name', type: DataType.STRING(250), allowNull: false })
  declare name: string;

  @Column({ field: 'methodology_type', type: DataType.STRING(40), allowNull: false })
  declare methodologyType: string;

  @Column({ field: 'description', type: DataType.TEXT, allowNull: true })
  declare description: string | null;

  @Column({ field: 'is_official', type: DataType.BOOLEAN, allowNull: false })
  declare isOfficial: boolean;

  @Column({ field: 'is_active', type: DataType.BOOLEAN, allowNull: false })
  declare isActive: boolean;
}
