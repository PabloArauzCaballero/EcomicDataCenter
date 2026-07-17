import { CreationOptional, InferAttributes, InferCreationAttributes } from 'sequelize';
import { Column, DataType, Model, Table } from 'sequelize-typescript';

@Table({ tableName: 'geographic_unit', schema: 'semantic', timestamps: false, underscored: true })
export class GeographicUnitModel extends Model<
  InferAttributes<GeographicUnitModel>,
  InferCreationAttributes<GeographicUnitModel>
> {
  @Column({ field: 'geographic_unit_id', type: DataType.UUID, allowNull: false, primaryKey: true, defaultValue: DataType.UUIDV4 })
  declare geographicUnitId: CreationOptional<string>;

  @Column({ field: 'parent_geographic_unit_id', type: DataType.UUID, allowNull: true })
  declare parentGeographicUnitId: string | null;

  @Column({ field: 'official_code', type: DataType.STRING(80), allowNull: false })
  declare officialCode: string;

  @Column({ field: 'name', type: DataType.STRING(250), allowNull: false })
  declare name: string;

  @Column({ field: 'geographic_level', type: DataType.STRING(40), allowNull: false })
  declare geographicLevel: string;

  @Column({ field: 'valid_from', type: DataType.DATEONLY, allowNull: false })
  declare validFrom: string;

  @Column({ field: 'valid_to', type: DataType.DATEONLY, allowNull: true })
  declare validTo: string | null;

  @Column({ field: 'geometry_reference', type: DataType.TEXT, allowNull: true })
  declare geometryReference: string | null;

}
