import { CreationOptional, InferAttributes, InferCreationAttributes } from 'sequelize';
import { Column, DataType, Model, Table } from 'sequelize-typescript';

@Table({
  tableName: 'measure_definition',
  schema: 'metadata',
  timestamps: false,
  underscored: true,
})
export class MeasureDefinitionModel extends Model<
  InferAttributes<MeasureDefinitionModel>,
  InferCreationAttributes<MeasureDefinitionModel>
> {
  @Column({
    field: 'measure_definition_id',
    type: DataType.UUID,
    allowNull: false,
    primaryKey: true,
    defaultValue: DataType.UUIDV4,
  })
  declare measureDefinitionId: CreationOptional<string>;

  @Column({ field: 'data_structure_id', type: DataType.UUID, allowNull: false })
  declare dataStructureId: string;

  @Column({ field: 'concept_id', type: DataType.UUID, allowNull: false })
  declare conceptId: string;

  @Column({ field: 'unit_measure_id', type: DataType.UUID, allowNull: true })
  declare unitMeasureId: string | null;

  @Column({ field: 'code', type: DataType.STRING(80), allowNull: false })
  declare code: string;

  @Column({ field: 'name', type: DataType.STRING(180), allowNull: false })
  declare name: string;

  @Column({ field: 'data_type', type: DataType.STRING(30), allowNull: false })
  declare dataType: string;

  @Column({ field: 'precision_scale', type: DataType.SMALLINT, allowNull: true })
  declare precisionScale: number | null;

  @Column({ field: 'is_primary_measure', type: DataType.BOOLEAN, allowNull: false })
  declare isPrimaryMeasure: boolean;
}
