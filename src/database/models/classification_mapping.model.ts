import { CreationOptional, InferAttributes, InferCreationAttributes } from 'sequelize';
import { Column, DataType, Model, Table } from 'sequelize-typescript';

@Table({ tableName: 'classification_mapping', schema: 'semantic', timestamps: false, underscored: true })
export class ClassificationMappingModel extends Model<
  InferAttributes<ClassificationMappingModel>,
  InferCreationAttributes<ClassificationMappingModel>
> {
  @Column({ field: 'classification_mapping_id', type: DataType.UUID, allowNull: false, primaryKey: true, defaultValue: DataType.UUIDV4 })
  declare classificationMappingId: CreationOptional<string>;

  @Column({ field: 'source_item_id', type: DataType.UUID, allowNull: false })
  declare sourceItemId: string;

  @Column({ field: 'target_item_id', type: DataType.UUID, allowNull: false })
  declare targetItemId: string;

  @Column({ field: 'equivalence_type', type: DataType.STRING(30), allowNull: false })
  declare equivalenceType: string;

  @Column({ field: 'weight', type: DataType.DECIMAL(18, 10), allowNull: true })
  declare weight: string | null;

  @Column({ field: 'valid_from', type: DataType.DATEONLY, allowNull: true })
  declare validFrom: string | null;

  @Column({ field: 'valid_to', type: DataType.DATEONLY, allowNull: true })
  declare validTo: string | null;

  @Column({ field: 'evidence_note', type: DataType.TEXT, allowNull: true })
  declare evidenceNote: string | null;

}
