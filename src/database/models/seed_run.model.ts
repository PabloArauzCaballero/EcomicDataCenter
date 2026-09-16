import { CreationOptional, InferAttributes, InferCreationAttributes } from 'sequelize';
import { Column, DataType, Model, Table } from 'sequelize-typescript';

@Table({ tableName: 'seed_run', schema: 'operations', timestamps: false, underscored: true })
export class SeedRunModel extends Model<
  InferAttributes<SeedRunModel>,
  InferCreationAttributes<SeedRunModel>
> {
  @Column({
    field: 'seed_run_id',
    type: DataType.UUID,
    allowNull: false,
    primaryKey: true,
    defaultValue: DataType.UUIDV4,
  })
  declare seedRunId: CreationOptional<string>;

  @Column({ field: 'package_code', type: DataType.STRING(80), allowNull: false })
  declare packageCode: string;

  @Column({ field: 'package_version', type: DataType.STRING(40), allowNull: false })
  declare packageVersion: string;

  @Column({ field: 'operation', type: DataType.STRING(20), allowNull: false })
  declare operation: string;

  @Column({ field: 'attempt_no', type: DataType.INTEGER, allowNull: false })
  declare attemptNo: number;

  @Column({ field: 'actor_subject', type: DataType.STRING(200), allowNull: false })
  declare actorSubject: string;

  @Column({ field: 'environment_id', type: DataType.STRING(60), allowNull: false })
  declare environmentId: string;

  @Column({ field: 'database_identity', type: DataType.STRING(200), allowNull: false })
  declare databaseIdentity: string;

  @Column({ field: 'status', type: DataType.STRING(20), allowNull: false })
  declare status: string;

  @Column({ field: 'request_fingerprint', type: DataType.CHAR(64), allowNull: false, unique: true })
  declare requestFingerprint: string;

  @Column({ field: 'started_at', type: DataType.DATE, allowNull: false })
  declare startedAt: Date;

  @Column({ field: 'heartbeat_at', type: DataType.DATE, allowNull: false })
  declare heartbeatAt: Date;

  @Column({ field: 'completed_at', type: DataType.DATE, allowNull: true })
  declare completedAt: Date | null;

  @Column({ field: 'error_summary', type: DataType.STRING(500), allowNull: true })
  declare errorSummary: string | null;

  @Column({ field: 'checkpoint_json', type: DataType.JSONB, allowNull: true })
  declare checkpointJson: Record<string, unknown> | null;

  @Column({ field: 'counters_json', type: DataType.JSONB, allowNull: false })
  declare countersJson: Record<string, unknown>;
}
