import { CreationOptional, InferAttributes, InferCreationAttributes } from 'sequelize';
import { Column, DataType, Model, Table } from 'sequelize-typescript';

@Table({ tableName: 'series', schema: 'statistics', timestamps: false, underscored: true })
export class SeriesModel extends Model<
  InferAttributes<SeriesModel>,
  InferCreationAttributes<SeriesModel>
> {
  @Column({
    field: 'series_id',
    type: DataType.UUID,
    allowNull: false,
    primaryKey: true,
    defaultValue: DataType.UUIDV4,
  })
  declare seriesId: CreationOptional<string>;

  @Column({ field: 'dataset_version_id', type: DataType.UUID, allowNull: false })
  declare datasetVersionId: string;

  @Column({ field: 'indicator_version_id', type: DataType.UUID, allowNull: true })
  declare indicatorVersionId: string | null;

  @Column({ field: 'frequency_id', type: DataType.UUID, allowNull: false })
  declare frequencyId: string;

  @Column({ field: 'unit_measure_id', type: DataType.UUID, allowNull: true })
  declare unitMeasureId: string | null;

  @Column({ field: 'series_key', type: DataType.TEXT, allowNull: false })
  declare seriesKey: string;

  @Column({ field: 'series_key_hash', type: DataType.CHAR(64), allowNull: false })
  declare seriesKeyHash: string;

  @Column({ field: 'status', type: DataType.STRING(30), allowNull: false })
  declare status: string;

  @Column({ field: 'valid_from', type: DataType.DATEONLY, allowNull: true })
  declare validFrom: string | null;

  @Column({ field: 'valid_to', type: DataType.DATEONLY, allowNull: true })
  declare validTo: string | null;
}
