import { CreationOptional, InferAttributes, InferCreationAttributes } from 'sequelize';
import { Column, DataType, Model, Table } from 'sequelize-typescript';

@Table({
  tableName: 'source_expectation',
  schema: 'operations',
  timestamps: false,
  underscored: true,
})
export class SourceExpectationModel extends Model<
  InferAttributes<SourceExpectationModel>,
  InferCreationAttributes<SourceExpectationModel>
> {
  @Column({
    field: 'source_expectation_id',
    type: DataType.UUID,
    allowNull: false,
    primaryKey: true,
    defaultValue: DataType.UUIDV4,
  })
  declare sourceExpectationId: CreationOptional<string>;

  @Column({ field: 'source_id', type: DataType.UUID, allowNull: false, unique: true })
  declare sourceId: string;

  @Column({ field: 'cadence', type: DataType.STRING(20), allowNull: false })
  declare cadence: string;

  @Column({ field: 'expected_interval_hours', type: DataType.INTEGER, allowNull: true })
  declare expectedIntervalHours: number | null;

  @Column({ field: 'tolerance_hours', type: DataType.INTEGER, allowNull: false })
  declare toleranceHours: number;

  @Column({ field: 'time_zone', type: DataType.STRING(60), allowNull: false })
  declare timeZone: string;

  @Column({ field: 'is_active', type: DataType.BOOLEAN, allowNull: false })
  declare isActive: boolean;
}
