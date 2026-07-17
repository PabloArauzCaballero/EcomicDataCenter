import { CreationOptional, InferAttributes, InferCreationAttributes } from 'sequelize';
import { Column, DataType, Model, Table } from 'sequelize-typescript';

@Table({
  tableName: 'series_break',
  schema: 'quality_lineage',
  timestamps: false,
  underscored: true,
})
export class SeriesBreakModel extends Model<
  InferAttributes<SeriesBreakModel>,
  InferCreationAttributes<SeriesBreakModel>
> {
  @Column({
    field: 'series_break_id',
    type: DataType.UUID,
    allowNull: false,
    primaryKey: true,
    defaultValue: DataType.UUIDV4,
  })
  declare seriesBreakId: CreationOptional<string>;

  @Column({ field: 'series_id', type: DataType.UUID, allowNull: false })
  declare seriesId: string;

  @Column({ field: 'methodology_version_id', type: DataType.UUID, allowNull: true })
  declare methodologyVersionId: string | null;

  @Column({ field: 'break_date', type: DataType.DATEONLY, allowNull: false })
  declare breakDate: string;

  @Column({ field: 'break_type', type: DataType.STRING(40), allowNull: false })
  declare breakType: string;

  @Column({ field: 'reason', type: DataType.TEXT, allowNull: false })
  declare reason: string;

  @Column({ field: 'is_comparable_before_after', type: DataType.BOOLEAN, allowNull: false })
  declare isComparableBeforeAfter: boolean;

  @Column({ field: 'linking_method', type: DataType.TEXT, allowNull: true })
  declare linkingMethod: string | null;

  @Column({ field: 'notes', type: DataType.TEXT, allowNull: true })
  declare notes: string | null;
}
