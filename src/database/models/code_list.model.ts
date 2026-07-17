import { CreationOptional, InferAttributes, InferCreationAttributes } from 'sequelize';
import { Column, DataType, Model, Table } from 'sequelize-typescript';

@Table({ tableName: 'code_list', schema: 'semantic', timestamps: false, underscored: true })
export class CodeListModel extends Model<
  InferAttributes<CodeListModel>,
  InferCreationAttributes<CodeListModel>
> {
  @Column({
    field: 'code_list_id',
    type: DataType.UUID,
    allowNull: false,
    primaryKey: true,
    defaultValue: DataType.UUIDV4,
  })
  declare codeListId: CreationOptional<string>;

  @Column({ field: 'owner_organization_id', type: DataType.UUID, allowNull: false })
  declare ownerOrganizationId: string;

  @Column({ field: 'code', type: DataType.STRING(80), allowNull: false })
  declare code: string;

  @Column({ field: 'name', type: DataType.STRING(180), allowNull: false })
  declare name: string;

  @Column({ field: 'version_code', type: DataType.STRING(40), allowNull: false })
  declare versionCode: string;

  @Column({ field: 'valid_from', type: DataType.DATEONLY, allowNull: true })
  declare validFrom: string | null;

  @Column({ field: 'valid_to', type: DataType.DATEONLY, allowNull: true })
  declare validTo: string | null;
}
