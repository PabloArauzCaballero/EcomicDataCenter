import { CreationOptional, InferAttributes, InferCreationAttributes } from 'sequelize';
import { Column, DataType, Model, Table } from 'sequelize-typescript';

@Table({ tableName: 'health_probe', schema: 'operations', timestamps: false, underscored: true })
export class HealthProbeModel extends Model<
  InferAttributes<HealthProbeModel>,
  InferCreationAttributes<HealthProbeModel>
> {
  @Column({
    field: 'health_probe_id',
    type: DataType.BIGINT,
    allowNull: false,
    primaryKey: true,
    autoIncrement: true,
  })
  declare healthProbeId: CreationOptional<string>;

  @Column({ field: 'target', type: DataType.STRING(80), allowNull: false })
  declare target: string;

  @Column({ field: 'probe_type', type: DataType.STRING(30), allowNull: false })
  declare probeType: string;

  @Column({ field: 'observed_at', type: DataType.DATE, allowNull: false })
  declare observedAt: Date;

  @Column({ field: 'duration_ms', type: DataType.INTEGER, allowNull: true })
  declare durationMs: number | null;

  @Column({ field: 'outcome', type: DataType.STRING(20), allowNull: false })
  declare outcome: string;

  @Column({ field: 'evidence_json', type: DataType.JSONB, allowNull: true })
  declare evidenceJson: Record<string, unknown> | null;

  @Column({ field: 'error_summary', type: DataType.STRING(300), allowNull: true })
  declare errorSummary: string | null;
}
