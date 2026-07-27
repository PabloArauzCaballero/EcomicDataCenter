import { CreationOptional, InferAttributes, InferCreationAttributes } from 'sequelize';
import { Column, DataType, Model, Table } from 'sequelize-typescript';

@Table({ tableName: 'audit_log', schema: 'audit', timestamps: false, underscored: true })
export class AuditLogModel extends Model<
  InferAttributes<AuditLogModel>,
  InferCreationAttributes<AuditLogModel>
> {
  @Column({
    field: 'audit_log_id',
    type: DataType.BIGINT,
    allowNull: false,
    primaryKey: true,
    autoIncrement: true,
  })
  declare auditLogId: CreationOptional<string>;

  @Column({ field: 'actor_organization_id', type: DataType.UUID, allowNull: true })
  declare actorOrganizationId: string | null;

  @Column({ field: 'actor_subject', type: DataType.STRING(200), allowNull: false })
  declare actorSubject: string;

  @Column({ field: 'actor_roles', type: DataType.STRING(200), allowNull: false })
  declare actorRoles: string;

  @Column({ field: 'action', type: DataType.STRING(80), allowNull: false })
  declare action: string;

  @Column({ field: 'entity_type', type: DataType.STRING(80), allowNull: false })
  declare entityType: string;

  @Column({ field: 'entity_reference', type: DataType.STRING(120), allowNull: true })
  declare entityReference: string | null;

  @Column({ field: 'outcome', type: DataType.STRING(20), allowNull: false })
  declare outcome: string;

  @Column({ field: 'correlation_id', type: DataType.STRING(128), allowNull: false })
  declare correlationId: string;

  @Column({ field: 'client_context', type: DataType.STRING(100), allowNull: true })
  declare clientContext: string | null;

  @Column({ field: 'details_json', type: DataType.JSONB, allowNull: false })
  declare detailsJson: Record<string, unknown>;

  @Column({ field: 'occurred_at', type: DataType.DATE, allowNull: false })
  declare occurredAt: Date;
}
