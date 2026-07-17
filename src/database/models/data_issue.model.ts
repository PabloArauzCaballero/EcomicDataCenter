import { CreationOptional, InferAttributes, InferCreationAttributes } from 'sequelize';
import { Column, DataType, Model, Table } from 'sequelize-typescript';

@Table({ tableName: 'data_issue', schema: 'quality_lineage', timestamps: false, underscored: true })
export class DataIssueModel extends Model<
  InferAttributes<DataIssueModel>,
  InferCreationAttributes<DataIssueModel>
> {
  @Column({ field: 'data_issue_id', type: DataType.UUID, allowNull: false, primaryKey: true, defaultValue: DataType.UUIDV4 })
  declare dataIssueId: CreationOptional<string>;

  @Column({ field: 'quality_assessment_id', type: DataType.BIGINT, allowNull: true })
  declare qualityAssessmentId: string | null;

  @Column({ field: 'issue_type', type: DataType.STRING(40), allowNull: false })
  declare issueType: string;

  @Column({ field: 'severity', type: DataType.STRING(20), allowNull: false })
  declare severity: string;

  @Column({ field: 'target_entity_type', type: DataType.STRING(40), allowNull: false })
  declare targetEntityType: string;

  @Column({ field: 'target_entity_id', type: DataType.STRING(80), allowNull: false })
  declare targetEntityId: string;

  @Column({ field: 'title', type: DataType.STRING(250), allowNull: false })
  declare title: string;

  @Column({ field: 'description', type: DataType.TEXT, allowNull: false })
  declare description: string;

  @Column({ field: 'status', type: DataType.STRING(30), allowNull: false })
  declare status: string;

  @Column({ field: 'detected_at', type: DataType.DATE, allowNull: false })
  declare detectedAt: Date;

  @Column({ field: 'resolved_at', type: DataType.DATE, allowNull: true })
  declare resolvedAt: Date | null;

  @Column({ field: 'resolution_notes', type: DataType.TEXT, allowNull: true })
  declare resolutionNotes: string | null;

}
