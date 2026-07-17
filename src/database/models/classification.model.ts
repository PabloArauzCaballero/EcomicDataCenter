import { CreationOptional, InferAttributes, InferCreationAttributes } from 'sequelize';
import { Column, DataType, Model, Table } from 'sequelize-typescript';

@Table({ tableName: 'classification', schema: 'semantic', timestamps: false, underscored: true })
export class ClassificationModel extends Model<
  InferAttributes<ClassificationModel>,
  InferCreationAttributes<ClassificationModel>
> {
  @Column({ field: 'classification_id', type: DataType.UUID, allowNull: false, primaryKey: true, defaultValue: DataType.UUIDV4 })
  declare classificationId: CreationOptional<string>;

  @Column({ field: 'custodian_organization_id', type: DataType.UUID, allowNull: false })
  declare custodianOrganizationId: string;

  @Column({ field: 'code', type: DataType.STRING(80), allowNull: false })
  declare code: string;

  @Column({ field: 'name', type: DataType.STRING(250), allowNull: false })
  declare name: string;

  @Column({ field: 'classification_type', type: DataType.STRING(50), allowNull: false })
  declare classificationType: string;

}
