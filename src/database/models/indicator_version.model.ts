import { CreationOptional, InferAttributes, InferCreationAttributes } from 'sequelize';
import { Column, DataType, Model, Table } from 'sequelize-typescript';

@Table({ tableName: 'indicator_version', schema: 'statistics', timestamps: false, underscored: true })
export class IndicatorVersionModel extends Model<
  InferAttributes<IndicatorVersionModel>,
  InferCreationAttributes<IndicatorVersionModel>
> {
  @Column({ field: 'indicator_version_id', type: DataType.UUID, allowNull: false, primaryKey: true, defaultValue: DataType.UUIDV4 })
  declare indicatorVersionId: CreationOptional<string>;

  @Column({ field: 'indicator_id', type: DataType.UUID, allowNull: false })
  declare indicatorId: string;

  @Column({ field: 'methodology_version_id', type: DataType.UUID, allowNull: true })
  declare methodologyVersionId: string | null;

  @Column({ field: 'unit_measure_id', type: DataType.UUID, allowNull: false })
  declare unitMeasureId: string;

  @Column({ field: 'frequency_id', type: DataType.UUID, allowNull: false })
  declare frequencyId: string;

  @Column({ field: 'version_number', type: DataType.INTEGER, allowNull: false })
  declare versionNumber: number;

  @Column({ field: 'definition', type: DataType.TEXT, allowNull: false })
  declare definition: string;

  @Column({ field: 'calculation_formula', type: DataType.TEXT, allowNull: true })
  declare calculationFormula: string | null;

  @Column({ field: 'valid_from', type: DataType.DATEONLY, allowNull: false })
  declare validFrom: string;

  @Column({ field: 'valid_to', type: DataType.DATEONLY, allowNull: true })
  declare validTo: string | null;

  @Column({ field: 'change_reason', type: DataType.TEXT, allowNull: true })
  declare changeReason: string | null;

}
