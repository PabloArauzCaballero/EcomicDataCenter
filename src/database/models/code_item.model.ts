import { CreationOptional, InferAttributes, InferCreationAttributes } from 'sequelize';
import { Column, DataType, Model, Table } from 'sequelize-typescript';

@Table({ tableName: 'code_item', schema: 'semantic', timestamps: false, underscored: true })
export class CodeItemModel extends Model<
  InferAttributes<CodeItemModel>,
  InferCreationAttributes<CodeItemModel>
> {
  @Column({
    field: 'code_item_id',
    type: DataType.UUID,
    allowNull: false,
    primaryKey: true,
    defaultValue: DataType.UUIDV4,
  })
  declare codeItemId: CreationOptional<string>;

  @Column({ field: 'code_list_id', type: DataType.UUID, allowNull: false })
  declare codeListId: string;

  @Column({ field: 'parent_code_item_id', type: DataType.UUID, allowNull: true })
  declare parentCodeItemId: string | null;

  @Column({ field: 'code', type: DataType.STRING(80), allowNull: false })
  declare code: string;

  @Column({ field: 'name', type: DataType.STRING(250), allowNull: false })
  declare name: string;

  @Column({ field: 'description', type: DataType.TEXT, allowNull: true })
  declare description: string | null;

  @Column({ field: 'sort_order', type: DataType.INTEGER, allowNull: false })
  declare sortOrder: number;

  @Column({ field: 'valid_from', type: DataType.DATEONLY, allowNull: true })
  declare validFrom: string | null;

  @Column({ field: 'valid_to', type: DataType.DATEONLY, allowNull: true })
  declare validTo: string | null;

  @Column({ field: 'is_active', type: DataType.BOOLEAN, allowNull: false })
  declare isActive: boolean;
}
