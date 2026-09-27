import { CreationOptional, InferAttributes, InferCreationAttributes } from 'sequelize';
import { Column, DataType, Model, Table } from 'sequelize-typescript';

@Table({ tableName: 'export_request', schema: 'operations', timestamps: false, underscored: true })
export class ExportRequestModel extends Model<
  InferAttributes<ExportRequestModel>,
  InferCreationAttributes<ExportRequestModel>
> {
  @Column({
    field: 'export_request_id',
    type: DataType.BIGINT,
    allowNull: false,
    primaryKey: true,
    autoIncrement: true,
  })
  declare exportRequestId: CreationOptional<string>;

  @Column({ field: 'request_id', type: DataType.STRING(64), allowNull: false })
  declare requestId: string;

  @Column({ field: 'dataset_code', type: DataType.STRING(40), allowNull: false })
  declare datasetCode: string;

  @Column({ field: 'export_format', type: DataType.STRING(10), allowNull: false })
  declare exportFormat: string;

  @Column({ field: 'status', type: DataType.STRING(20), allowNull: false })
  declare status: string;

  @Column({ field: 'filters_json', type: DataType.JSONB, allowNull: false })
  declare filtersJson: Record<string, unknown>;

  @Column({ field: 'row_count', type: DataType.BIGINT, allowNull: true })
  declare rowCount: string | null;

  @Column({ field: 'byte_count', type: DataType.BIGINT, allowNull: true })
  declare byteCount: string | null;

  @Column({ field: 'duration_ms', type: DataType.INTEGER, allowNull: true })
  declare durationMs: number | null;

  @Column({ field: 'truncated', type: DataType.BOOLEAN, allowNull: false })
  declare truncated: boolean;

  @Column({ field: 'occurred_at', type: DataType.DATE, allowNull: false })
  declare occurredAt: Date;

  @Column({ field: 'error_code', type: DataType.STRING(60), allowNull: true })
  declare errorCode: string | null;
}
