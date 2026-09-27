import { CreationOptional, InferAttributes, InferCreationAttributes } from 'sequelize';
import { Column, DataType, Model, Table } from 'sequelize-typescript';

@Table({ tableName: 'health_incident', schema: 'operations', timestamps: false, underscored: true })
export class HealthIncidentModel extends Model<
  InferAttributes<HealthIncidentModel>,
  InferCreationAttributes<HealthIncidentModel>
> {
  @Column({
    field: 'health_incident_id',
    type: DataType.UUID,
    allowNull: false,
    primaryKey: true,
    defaultValue: DataType.UUIDV4,
  })
  declare healthIncidentId: CreationOptional<string>;

  @Column({ field: 'target', type: DataType.STRING(80), allowNull: false })
  declare target: string;

  @Column({ field: 'status', type: DataType.STRING(20), allowNull: false })
  declare status: string;

  @Column({ field: 'cause', type: DataType.STRING(200), allowNull: false })
  declare cause: string;

  @Column({ field: 'consecutive_failures', type: DataType.INTEGER, allowNull: false })
  declare consecutiveFailures: number;

  @Column({ field: 'opened_at', type: DataType.DATE, allowNull: false })
  declare openedAt: Date;

  @Column({ field: 'closed_at', type: DataType.DATE, allowNull: true })
  declare closedAt: Date | null;
}
