import { CreationOptional, InferAttributes, InferCreationAttributes } from 'sequelize';
import { Column, DataType, Model, Table } from 'sequelize-typescript';

@Table({ tableName: 'observation_attribute_value', schema: 'statistics', timestamps: false, underscored: true })
export class ObservationAttributeValueModel extends Model<
  InferAttributes<ObservationAttributeValueModel>,
  InferCreationAttributes<ObservationAttributeValueModel>
> {
  @Column({ field: 'observation_attribute_value_id', type: DataType.BIGINT, allowNull: false, primaryKey: true, autoIncrement: true })
  declare observationAttributeValueId: CreationOptional<string>;

  @Column({ field: 'observation_revision_id', type: DataType.BIGINT, allowNull: false })
  declare observationRevisionId: string;

  @Column({ field: 'attribute_definition_id', type: DataType.UUID, allowNull: false })
  declare attributeDefinitionId: string;

  @Column({ field: 'code_item_id', type: DataType.UUID, allowNull: true })
  declare codeItemId: string | null;

  @Column({ field: 'numeric_value', type: DataType.DECIMAL(38, 12), allowNull: true })
  declare numericValue: string | null;

  @Column({ field: 'text_value', type: DataType.TEXT, allowNull: true })
  declare textValue: string | null;

  @Column({ field: 'boolean_value', type: DataType.BOOLEAN, allowNull: true })
  declare booleanValue: boolean | null;

}
