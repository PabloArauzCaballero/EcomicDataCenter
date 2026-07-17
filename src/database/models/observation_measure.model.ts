import { CreationOptional, InferAttributes, InferCreationAttributes } from 'sequelize';
import { Column, DataType, Model, Table } from 'sequelize-typescript';

@Table({ tableName: 'observation_measure', schema: 'statistics', timestamps: false, underscored: true })
export class ObservationMeasureModel extends Model<
  InferAttributes<ObservationMeasureModel>,
  InferCreationAttributes<ObservationMeasureModel>
> {
  @Column({ field: 'observation_measure_id', type: DataType.BIGINT, allowNull: false, primaryKey: true, autoIncrement: true })
  declare observationMeasureId: CreationOptional<string>;

  @Column({ field: 'observation_revision_id', type: DataType.BIGINT, allowNull: false })
  declare observationRevisionId: string;

  @Column({ field: 'measure_definition_id', type: DataType.UUID, allowNull: false })
  declare measureDefinitionId: string;

  @Column({ field: 'numeric_value', type: DataType.DECIMAL(38, 12), allowNull: true })
  declare numericValue: string | null;

  @Column({ field: 'text_value', type: DataType.TEXT, allowNull: true })
  declare textValue: string | null;

  @Column({ field: 'boolean_value', type: DataType.BOOLEAN, allowNull: true })
  declare booleanValue: boolean | null;

}
