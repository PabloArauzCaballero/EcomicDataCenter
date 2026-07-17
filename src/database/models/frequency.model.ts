import { CreationOptional, InferAttributes, InferCreationAttributes } from 'sequelize';
import { Column, DataType, Model, Table } from 'sequelize-typescript';

@Table({ tableName: 'frequency', schema: 'semantic', timestamps: false, underscored: true })
export class FrequencyModel extends Model<
  InferAttributes<FrequencyModel>,
  InferCreationAttributes<FrequencyModel>
> {
  @Column({
    field: 'frequency_id',
    type: DataType.UUID,
    allowNull: false,
    primaryKey: true,
    defaultValue: DataType.UUIDV4,
  })
  declare frequencyId: CreationOptional<string>;

  @Column({ field: 'code', type: DataType.STRING(10), allowNull: false, unique: true })
  declare code: string;

  @Column({ field: 'name', type: DataType.STRING(80), allowNull: false })
  declare name: string;

  @Column({ field: 'periods_per_year', type: DataType.SMALLINT, allowNull: true })
  declare periodsPerYear: number | null;

  @Column({ field: 'iso_duration', type: DataType.STRING(40), allowNull: true })
  declare isoDuration: string | null;
}
