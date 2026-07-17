import { CreationOptional, InferAttributes, InferCreationAttributes } from 'sequelize';
import { Column, DataType, Model, Table } from 'sequelize-typescript';

@Table({ tableName: 'observation', schema: 'statistics', timestamps: false, underscored: true })
export class ObservationModel extends Model<
  InferAttributes<ObservationModel>,
  InferCreationAttributes<ObservationModel>
> {
  @Column({ field: 'observation_id', type: DataType.BIGINT, allowNull: false, primaryKey: true, autoIncrement: true })
  declare observationId: CreationOptional<string>;

  @Column({ field: 'series_id', type: DataType.UUID, allowNull: false })
  declare seriesId: string;

  @Column({ field: 'period_start', type: DataType.DATEONLY, allowNull: false })
  declare periodStart: string;

  @Column({ field: 'period_end', type: DataType.DATEONLY, allowNull: false })
  declare periodEnd: string;

  @Column({ field: 'period_code', type: DataType.STRING(40), allowNull: false })
  declare periodCode: string;

  @Column({ field: 'reference_date', type: DataType.DATEONLY, allowNull: true })
  declare referenceDate: string | null;

}
