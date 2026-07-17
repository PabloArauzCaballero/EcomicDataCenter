import { CreationOptional, InferAttributes, InferCreationAttributes } from 'sequelize';
import { Column, DataType, Model, Table } from 'sequelize-typescript';

@Table({ tableName: 'organization', schema: 'provenance', timestamps: false, underscored: true })
export class OrganizationModel extends Model<
  InferAttributes<OrganizationModel>,
  InferCreationAttributes<OrganizationModel>
> {
  @Column({ field: 'organization_id', type: DataType.UUID, allowNull: false, primaryKey: true, defaultValue: DataType.UUIDV4 })
  declare organizationId: CreationOptional<string>;

  @Column({ field: 'parent_organization_id', type: DataType.UUID, allowNull: true })
  declare parentOrganizationId: string | null;

  @Column({ field: 'code', type: DataType.STRING(50), allowNull: false, unique: true })
  declare code: string;

  @Column({ field: 'legal_name', type: DataType.STRING(250), allowNull: false })
  declare legalName: string;

  @Column({ field: 'short_name', type: DataType.STRING(80), allowNull: false })
  declare shortName: string;

  @Column({ field: 'organization_type', type: DataType.STRING(40), allowNull: false })
  declare organizationType: string;

  @Column({ field: 'country_code', type: DataType.CHAR(2), allowNull: false })
  declare countryCode: string;

  @Column({ field: 'official_statistics_producer', type: DataType.BOOLEAN, allowNull: false })
  declare officialStatisticsProducer: boolean;

  @Column({ field: 'is_active', type: DataType.BOOLEAN, allowNull: false })
  declare isActive: boolean;

  @Column({ field: 'valid_from', type: DataType.DATEONLY, allowNull: false })
  declare validFrom: string;

  @Column({ field: 'valid_to', type: DataType.DATEONLY, allowNull: true })
  declare validTo: string | null;

}
