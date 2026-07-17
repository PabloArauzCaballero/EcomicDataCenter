import { CreationOptional, InferAttributes, InferCreationAttributes } from 'sequelize';
import { Column, DataType, Model, Table } from 'sequelize-typescript';

@Table({ tableName: 'unit_measure', schema: 'semantic', timestamps: false, underscored: true })
export class UnitMeasureModel extends Model<
  InferAttributes<UnitMeasureModel>,
  InferCreationAttributes<UnitMeasureModel>
> {
  @Column({ field: 'unit_measure_id', type: DataType.UUID, allowNull: false, primaryKey: true, defaultValue: DataType.UUIDV4 })
  declare unitMeasureId: CreationOptional<string>;

  @Column({ field: 'base_unit_measure_id', type: DataType.UUID, allowNull: true })
  declare baseUnitMeasureId: string | null;

  @Column({ field: 'code', type: DataType.STRING(50), allowNull: false, unique: true })
  declare code: string;

  @Column({ field: 'name', type: DataType.STRING(180), allowNull: false })
  declare name: string;

  @Column({ field: 'symbol', type: DataType.STRING(30), allowNull: true })
  declare symbol: string | null;

  @Column({ field: 'multiplier_power10', type: DataType.SMALLINT, allowNull: false })
  declare multiplierPower10: number;

  @Column({ field: 'value_kind', type: DataType.STRING(30), allowNull: false })
  declare valueKind: string;

}
