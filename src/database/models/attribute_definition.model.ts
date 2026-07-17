import { CreationOptional, InferAttributes, InferCreationAttributes } from 'sequelize';
import { Column, DataType, Model, Table } from 'sequelize-typescript';

@Table({
  tableName: 'attribute_definition',
  schema: 'metadata',
  timestamps: false,
  underscored: true,
})
export class AttributeDefinitionModel extends Model<
  InferAttributes<AttributeDefinitionModel>,
  InferCreationAttributes<AttributeDefinitionModel>
> {
  @Column({
    field: 'attribute_definition_id',
    type: DataType.UUID,
    allowNull: false,
    primaryKey: true,
    defaultValue: DataType.UUIDV4,
  })
  declare attributeDefinitionId: CreationOptional<string>;

  @Column({ field: 'data_structure_id', type: DataType.UUID, allowNull: false })
  declare dataStructureId: string;

  @Column({ field: 'concept_id', type: DataType.UUID, allowNull: false })
  declare conceptId: string;

  @Column({ field: 'code_list_id', type: DataType.UUID, allowNull: true })
  declare codeListId: string | null;

  @Column({ field: 'code', type: DataType.STRING(80), allowNull: false })
  declare code: string;

  @Column({ field: 'name', type: DataType.STRING(180), allowNull: false })
  declare name: string;

  @Column({ field: 'data_type', type: DataType.STRING(30), allowNull: false })
  declare dataType: string;

  @Column({ field: 'attachment_level', type: DataType.STRING(20), allowNull: false })
  declare attachmentLevel: string;

  @Column({ field: 'is_required', type: DataType.BOOLEAN, allowNull: false })
  declare isRequired: boolean;
}
