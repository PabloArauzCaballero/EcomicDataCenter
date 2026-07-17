import { CreationOptional, InferAttributes, InferCreationAttributes } from 'sequelize';
import { Column, DataType, Model, Table } from 'sequelize-typescript';

@Table({
  tableName: 'methodology_version',
  schema: 'metadata',
  timestamps: false,
  underscored: true,
})
export class MethodologyVersionModel extends Model<
  InferAttributes<MethodologyVersionModel>,
  InferCreationAttributes<MethodologyVersionModel>
> {
  @Column({
    field: 'methodology_version_id',
    type: DataType.UUID,
    allowNull: false,
    primaryKey: true,
    defaultValue: DataType.UUIDV4,
  })
  declare methodologyVersionId: CreationOptional<string>;

  @Column({ field: 'methodology_id', type: DataType.UUID, allowNull: false })
  declare methodologyId: string;

  @Column({ field: 'version_code', type: DataType.STRING(40), allowNull: false })
  declare versionCode: string;

  @Column({ field: 'title', type: DataType.STRING(300), allowNull: false })
  declare title: string;

  @Column({ field: 'status', type: DataType.STRING(30), allowNull: false })
  declare status: string;

  @Column({ field: 'formula_description', type: DataType.TEXT, allowNull: true })
  declare formulaDescription: string | null;

  @Column({ field: 'universe_definition', type: DataType.TEXT, allowNull: true })
  declare universeDefinition: string | null;

  @Column({ field: 'sampling_method', type: DataType.TEXT, allowNull: true })
  declare samplingMethod: string | null;

  @Column({ field: 'missing_data_treatment', type: DataType.TEXT, allowNull: true })
  declare missingDataTreatment: string | null;

  @Column({ field: 'seasonal_adjustment_method', type: DataType.TEXT, allowNull: true })
  declare seasonalAdjustmentMethod: string | null;

  @Column({ field: 'revision_policy', type: DataType.TEXT, allowNull: true })
  declare revisionPolicy: string | null;

  @Column({ field: 'confidentiality_policy', type: DataType.TEXT, allowNull: true })
  declare confidentialityPolicy: string | null;

  @Column({ field: 'valid_from', type: DataType.DATEONLY, allowNull: false })
  declare validFrom: string;

  @Column({ field: 'valid_to', type: DataType.DATEONLY, allowNull: true })
  declare validTo: string | null;

  @Column({ field: 'publication_date', type: DataType.DATEONLY, allowNull: true })
  declare publicationDate: string | null;

  @Column({ field: 'document_uri', type: DataType.TEXT, allowNull: true })
  declare documentUri: string | null;

  @Column({ field: 'is_current', type: DataType.BOOLEAN, allowNull: false })
  declare isCurrent: boolean;
}
