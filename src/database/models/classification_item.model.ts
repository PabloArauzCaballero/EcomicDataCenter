import { CreationOptional, InferAttributes, InferCreationAttributes } from 'sequelize';
import { Column, DataType, Model, Table } from 'sequelize-typescript';

@Table({
  tableName: 'classification_item',
  schema: 'semantic',
  timestamps: false,
  underscored: true,
})
export class ClassificationItemModel extends Model<
  InferAttributes<ClassificationItemModel>,
  InferCreationAttributes<ClassificationItemModel>
> {
  @Column({
    field: 'classification_item_id',
    type: DataType.UUID,
    allowNull: false,
    primaryKey: true,
    defaultValue: DataType.UUIDV4,
  })
  declare classificationItemId: CreationOptional<string>;

  @Column({ field: 'classification_version_id', type: DataType.UUID, allowNull: false })
  declare classificationVersionId: string;

  @Column({ field: 'parent_item_id', type: DataType.UUID, allowNull: true })
  declare parentItemId: string | null;

  @Column({ field: 'code', type: DataType.STRING(80), allowNull: false })
  declare code: string;

  @Column({ field: 'name', type: DataType.STRING(300), allowNull: false })
  declare name: string;

  @Column({ field: 'description', type: DataType.TEXT, allowNull: true })
  declare description: string | null;

  @Column({ field: 'level_no', type: DataType.INTEGER, allowNull: false })
  declare levelNo: number;

  @Column({ field: 'sort_order', type: DataType.INTEGER, allowNull: false })
  declare sortOrder: number;

  @Column({ field: 'valid_from', type: DataType.DATEONLY, allowNull: true })
  declare validFrom: string | null;

  @Column({ field: 'valid_to', type: DataType.DATEONLY, allowNull: true })
  declare validTo: string | null;
}
