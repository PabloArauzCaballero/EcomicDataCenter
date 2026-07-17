import { CreationOptional, InferAttributes, InferCreationAttributes } from 'sequelize';
import { Column, DataType, Model, Table } from 'sequelize-typescript';

@Table({ tableName: 'series_dimension_value', schema: 'statistics', timestamps: false, underscored: true })
export class SeriesDimensionValueModel extends Model<
  InferAttributes<SeriesDimensionValueModel>,
  InferCreationAttributes<SeriesDimensionValueModel>
> {
  @Column({ field: 'series_dimension_value_id', type: DataType.BIGINT, allowNull: false, primaryKey: true, autoIncrement: true })
  declare seriesDimensionValueId: CreationOptional<string>;

  @Column({ field: 'series_id', type: DataType.UUID, allowNull: false })
  declare seriesId: string;

  @Column({ field: 'dimension_definition_id', type: DataType.UUID, allowNull: false })
  declare dimensionDefinitionId: string;

  @Column({ field: 'code_item_id', type: DataType.UUID, allowNull: true })
  declare codeItemId: string | null;

  @Column({ field: 'classification_item_id', type: DataType.UUID, allowNull: true })
  declare classificationItemId: string | null;

  @Column({ field: 'geographic_unit_id', type: DataType.UUID, allowNull: true })
  declare geographicUnitId: string | null;

  @Column({ field: 'text_value', type: DataType.TEXT, allowNull: true })
  declare textValue: string | null;

  @Column({ field: 'numeric_value', type: DataType.DECIMAL(38, 12), allowNull: true })
  declare numericValue: string | null;

  @Column({ field: 'date_value', type: DataType.DATEONLY, allowNull: true })
  declare dateValue: string | null;

}
