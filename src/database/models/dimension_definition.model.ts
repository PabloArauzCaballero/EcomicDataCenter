import { CreationOptional, InferAttributes, InferCreationAttributes } from 'sequelize';
import { Column, DataType, Model, Table } from 'sequelize-typescript';

@Table({ tableName: 'dimension_definition', schema: 'metadata', timestamps: false, underscored: true })
export class DimensionDefinitionModel extends Model<
  InferAttributes<DimensionDefinitionModel>,
  InferCreationAttributes<DimensionDefinitionModel>
> {
  @Column({ field: 'dimension_definition_id', type: DataType.UUID, allowNull: false, primaryKey: true, defaultValue: DataType.UUIDV4 })
  declare dimensionDefinitionId: CreationOptional<string>;

  @Column({ field: 'data_structure_id', type: DataType.UUID, allowNull: false })
  declare dataStructureId: string;

  @Column({ field: 'concept_id', type: DataType.UUID, allowNull: false })
  declare conceptId: string;

  @Column({ field: 'code_list_id', type: DataType.UUID, allowNull: true })
  declare codeListId: string | null;

  @Column({ field: 'classification_version_id', type: DataType.UUID, allowNull: true })
  declare classificationVersionId: string | null;

  @Column({ field: 'code', type: DataType.STRING(80), allowNull: false })
  declare code: string;

  @Column({ field: 'role', type: DataType.STRING(30), allowNull: false })
  declare role: string;

  @Column({ field: 'position_no', type: DataType.SMALLINT, allowNull: false })
  declare positionNo: number;

  @Column({ field: 'attachment_level', type: DataType.STRING(20), allowNull: false })
  declare attachmentLevel: string;

  @Column({ field: 'representation_kind', type: DataType.STRING(30), allowNull: false })
  declare representationKind: string;

  @Column({ field: 'is_required', type: DataType.BOOLEAN, allowNull: false })
  declare isRequired: boolean;

  @Column({ field: 'is_time_dimension', type: DataType.BOOLEAN, allowNull: false })
  declare isTimeDimension: boolean;

}
