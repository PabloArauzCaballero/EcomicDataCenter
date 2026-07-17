import { CreationOptional, InferAttributes, InferCreationAttributes } from 'sequelize';
import { Column, DataType, Model, Table } from 'sequelize-typescript';

@Table({ tableName: 'dataset', schema: 'metadata', timestamps: false, underscored: true })
export class DatasetModel extends Model<
  InferAttributes<DatasetModel>,
  InferCreationAttributes<DatasetModel>
> {
  @Column({
    field: 'dataset_id',
    type: DataType.UUID,
    allowNull: false,
    primaryKey: true,
    defaultValue: DataType.UUIDV4,
  })
  declare datasetId: CreationOptional<string>;

  @Column({ field: 'statistical_operation_id', type: DataType.UUID, allowNull: true })
  declare statisticalOperationId: string | null;

  @Column({ field: 'source_id', type: DataType.UUID, allowNull: false })
  declare sourceId: string;

  @Column({ field: 'producer_organization_id', type: DataType.UUID, allowNull: false })
  declare producerOrganizationId: string;

  @Column({ field: 'statistical_domain_id', type: DataType.UUID, allowNull: false })
  declare statisticalDomainId: string;

  @Column({ field: 'code', type: DataType.STRING(80), allowNull: false })
  declare code: string;

  @Column({ field: 'name', type: DataType.STRING(300), allowNull: false })
  declare name: string;

  @Column({ field: 'description', type: DataType.TEXT, allowNull: true })
  declare description: string | null;

  @Column({ field: 'data_nature', type: DataType.STRING(40), allowNull: false })
  declare dataNature: string;

  @Column({ field: 'publication_status', type: DataType.STRING(30), allowNull: false })
  declare publicationStatus: string;

  @Column({ field: 'license_code', type: DataType.STRING(80), allowNull: true })
  declare licenseCode: string | null;

  @Column({ field: 'confidentiality_level', type: DataType.STRING(30), allowNull: false })
  declare confidentialityLevel: string;
}
