import { CreationOptional, InferAttributes, InferCreationAttributes } from 'sequelize';
import { Column, DataType, Model, Table } from 'sequelize-typescript';

@Table({ tableName: 'dataset_version', schema: 'metadata', timestamps: false, underscored: true })
export class DatasetVersionModel extends Model<
  InferAttributes<DatasetVersionModel>,
  InferCreationAttributes<DatasetVersionModel>
> {
  @Column({ field: 'dataset_version_id', type: DataType.UUID, allowNull: false, primaryKey: true, defaultValue: DataType.UUIDV4 })
  declare datasetVersionId: CreationOptional<string>;

  @Column({ field: 'dataset_id', type: DataType.UUID, allowNull: false })
  declare datasetId: string;

  @Column({ field: 'methodology_version_id', type: DataType.UUID, allowNull: false })
  declare methodologyVersionId: string;

  @Column({ field: 'data_structure_id', type: DataType.UUID, allowNull: false })
  declare dataStructureId: string;

  @Column({ field: 'version_code', type: DataType.STRING(40), allowNull: false })
  declare versionCode: string;

  @Column({ field: 'title', type: DataType.STRING(300), allowNull: false })
  declare title: string;

  @Column({ field: 'status', type: DataType.STRING(30), allowNull: false })
  declare status: string;

  @Column({ field: 'reference_base_period', type: DataType.STRING(40), allowNull: true })
  declare referenceBasePeriod: string | null;

  @Column({ field: 'valid_from', type: DataType.DATEONLY, allowNull: false })
  declare validFrom: string;

  @Column({ field: 'valid_to', type: DataType.DATEONLY, allowNull: true })
  declare validTo: string | null;

  @Column({ field: 'publication_date', type: DataType.DATEONLY, allowNull: true })
  declare publicationDate: string | null;

  @Column({ field: 'is_current', type: DataType.BOOLEAN, allowNull: false })
  declare isCurrent: boolean;

  @Column({ field: 'change_reason', type: DataType.TEXT, allowNull: true })
  declare changeReason: string | null;

}
