import { CreationOptional, InferAttributes, InferCreationAttributes } from 'sequelize';
import { Column, DataType, Model, Table } from 'sequelize-typescript';

@Table({ tableName: 'source', schema: 'provenance', timestamps: false, underscored: true })
export class SourceModel extends Model<
  InferAttributes<SourceModel>,
  InferCreationAttributes<SourceModel>
> {
  @Column({ field: 'source_id', type: DataType.UUID, allowNull: false, primaryKey: true, defaultValue: DataType.UUIDV4 })
  declare sourceId: CreationOptional<string>;

  @Column({ field: 'organization_id', type: DataType.UUID, allowNull: false })
  declare organizationId: string;

  @Column({ field: 'frequency_id', type: DataType.UUID, allowNull: true })
  declare frequencyId: string | null;

  @Column({ field: 'code', type: DataType.STRING(80), allowNull: false, unique: true })
  declare code: string;

  @Column({ field: 'name', type: DataType.STRING(250), allowNull: false })
  declare name: string;

  @Column({ field: 'source_type', type: DataType.STRING(40), allowNull: false })
  declare sourceType: string;

  @Column({ field: 'access_method', type: DataType.STRING(40), allowNull: false })
  declare accessMethod: string;

  @Column({ field: 'official_uri', type: DataType.TEXT, allowNull: true })
  declare officialUri: string | null;

  @Column({ field: 'license_code', type: DataType.STRING(80), allowNull: true })
  declare licenseCode: string | null;

  @Column({ field: 'active_from', type: DataType.DATEONLY, allowNull: true })
  declare activeFrom: string | null;

  @Column({ field: 'active_to', type: DataType.DATEONLY, allowNull: true })
  declare activeTo: string | null;

  @Column({ field: 'is_active', type: DataType.BOOLEAN, allowNull: false })
  declare isActive: boolean;

}
