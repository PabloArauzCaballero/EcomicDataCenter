import { CreationOptional, InferAttributes, InferCreationAttributes } from 'sequelize';
import { Column, DataType, Model, Table } from 'sequelize-typescript';

@Table({ tableName: 'classification_version', schema: 'semantic', timestamps: false, underscored: true })
export class ClassificationVersionModel extends Model<
  InferAttributes<ClassificationVersionModel>,
  InferCreationAttributes<ClassificationVersionModel>
> {
  @Column({ field: 'classification_version_id', type: DataType.UUID, allowNull: false, primaryKey: true, defaultValue: DataType.UUIDV4 })
  declare classificationVersionId: CreationOptional<string>;

  @Column({ field: 'classification_id', type: DataType.UUID, allowNull: false })
  declare classificationId: string;

  @Column({ field: 'version_code', type: DataType.STRING(40), allowNull: false })
  declare versionCode: string;

  @Column({ field: 'name', type: DataType.STRING(250), allowNull: false })
  declare name: string;

  @Column({ field: 'valid_from', type: DataType.DATEONLY, allowNull: true })
  declare validFrom: string | null;

  @Column({ field: 'valid_to', type: DataType.DATEONLY, allowNull: true })
  declare validTo: string | null;

  @Column({ field: 'publication_date', type: DataType.DATEONLY, allowNull: true })
  declare publicationDate: string | null;

  @Column({ field: 'is_current', type: DataType.BOOLEAN, allowNull: false })
  declare isCurrent: boolean;

  @Column({ field: 'methodology_uri', type: DataType.TEXT, allowNull: true })
  declare methodologyUri: string | null;

}
