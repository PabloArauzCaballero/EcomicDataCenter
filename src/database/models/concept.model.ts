import { CreationOptional, InferAttributes, InferCreationAttributes } from 'sequelize';
import { Column, DataType, Model, Table } from 'sequelize-typescript';

@Table({ tableName: 'concept', schema: 'semantic', timestamps: false, underscored: true })
export class ConceptModel extends Model<
  InferAttributes<ConceptModel>,
  InferCreationAttributes<ConceptModel>
> {
  @Column({
    field: 'concept_id',
    type: DataType.UUID,
    allowNull: false,
    primaryKey: true,
    defaultValue: DataType.UUIDV4,
  })
  declare conceptId: CreationOptional<string>;

  @Column({ field: 'owner_organization_id', type: DataType.UUID, allowNull: false })
  declare ownerOrganizationId: string;

  @Column({ field: 'code', type: DataType.STRING(80), allowNull: false })
  declare code: string;

  @Column({ field: 'name', type: DataType.STRING(180), allowNull: false })
  declare name: string;

  @Column({ field: 'definition', type: DataType.TEXT, allowNull: false })
  declare definition: string;

  @Column({ field: 'concept_type', type: DataType.STRING(40), allowNull: false })
  declare conceptType: string;

  @Column({ field: 'valid_from', type: DataType.DATEONLY, allowNull: true })
  declare validFrom: string | null;

  @Column({ field: 'valid_to', type: DataType.DATEONLY, allowNull: true })
  declare validTo: string | null;
}
