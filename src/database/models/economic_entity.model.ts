import { CreationOptional, InferAttributes, InferCreationAttributes } from 'sequelize';
import { Column, DataType, Model, Table } from 'sequelize-typescript';

@Table({
  tableName: 'economic_entity',
  schema: 'intelligence',
  timestamps: false,
  underscored: true,
})
export class EconomicEntityModel extends Model<
  InferAttributes<EconomicEntityModel>,
  InferCreationAttributes<EconomicEntityModel>
> {
  @Column({
    field: 'economic_entity_id',
    type: DataType.UUID,
    allowNull: false,
    primaryKey: true,
    defaultValue: DataType.UUIDV4,
  })
  declare economicEntityId: CreationOptional<string>;

  @Column({ field: 'parent_entity_id', type: DataType.UUID, allowNull: true })
  declare parentEntityId: string | null;

  @Column({ field: 'classification_item_id', type: DataType.UUID, allowNull: true })
  declare classificationItemId: string | null;

  @Column({ field: 'geographic_unit_id', type: DataType.UUID, allowNull: true })
  declare geographicUnitId: string | null;

  @Column({ field: 'entity_type', type: DataType.STRING(40), allowNull: false })
  declare entityType: string;

  @Column({ field: 'legal_name', type: DataType.STRING(250), allowNull: false })
  declare legalName: string;

  @Column({ field: 'short_name', type: DataType.STRING(120), allowNull: true })
  declare shortName: string | null;

  @Column({ field: 'tax_identifier', type: DataType.STRING(50), allowNull: true })
  declare taxIdentifier: string | null;

  @Column({ field: 'country_code', type: DataType.CHAR(2), allowNull: false })
  declare countryCode: string;

  @Column({ field: 'economic_relevance', type: DataType.STRING(20), allowNull: true })
  declare economicRelevance: string | null;

  @Column({ field: 'is_active', type: DataType.BOOLEAN, allowNull: false })
  declare isActive: boolean;
}
