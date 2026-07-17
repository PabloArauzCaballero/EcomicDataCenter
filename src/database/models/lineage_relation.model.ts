import { CreationOptional, InferAttributes, InferCreationAttributes } from 'sequelize';
import { Column, DataType, Model, Table } from 'sequelize-typescript';

@Table({ tableName: 'lineage_relation', schema: 'quality_lineage', timestamps: false, underscored: true })
export class LineageRelationModel extends Model<
  InferAttributes<LineageRelationModel>,
  InferCreationAttributes<LineageRelationModel>
> {
  @Column({ field: 'lineage_relation_id', type: DataType.UUID, allowNull: false, primaryKey: true, defaultValue: DataType.UUIDV4 })
  declare lineageRelationId: CreationOptional<string>;

  @Column({ field: 'methodology_version_id', type: DataType.UUID, allowNull: true })
  declare methodologyVersionId: string | null;

  @Column({ field: 'source_entity_type', type: DataType.STRING(40), allowNull: false })
  declare sourceEntityType: string;

  @Column({ field: 'source_entity_id', type: DataType.STRING(80), allowNull: false })
  declare sourceEntityId: string;

  @Column({ field: 'target_entity_type', type: DataType.STRING(40), allowNull: false })
  declare targetEntityType: string;

  @Column({ field: 'target_entity_id', type: DataType.STRING(80), allowNull: false })
  declare targetEntityId: string;

  @Column({ field: 'relation_type', type: DataType.STRING(40), allowNull: false })
  declare relationType: string;

  @Column({ field: 'transformation_description', type: DataType.TEXT, allowNull: true })
  declare transformationDescription: string | null;

  @Column({ field: 'formula', type: DataType.TEXT, allowNull: true })
  declare formula: string | null;

  @Column({ field: 'created_at', type: DataType.DATE, allowNull: false })
  declare createdAt: Date;

}
