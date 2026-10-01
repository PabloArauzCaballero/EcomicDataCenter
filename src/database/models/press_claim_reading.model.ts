import { CreationOptional, InferAttributes, InferCreationAttributes } from 'sequelize';
import { Column, DataType, Model, Table } from 'sequelize-typescript';

@Table({
  tableName: 'press_claim_reading',
  schema: 'intelligence',
  timestamps: false,
  underscored: true,
})
export class PressClaimReadingModel extends Model<
  InferAttributes<PressClaimReadingModel>,
  InferCreationAttributes<PressClaimReadingModel>
> {
  @Column({
    field: 'fact_claim_id',
    type: DataType.UUID,
    allowNull: false,
    primaryKey: true,
    defaultValue: DataType.UUIDV4,
  })
  declare factClaimId: CreationOptional<string>;

  @Column({ field: 'class_digest', type: DataType.STRING(32), allowNull: false })
  declare classDigest: string;

  @Column({ field: 'term_digest', type: DataType.STRING(32), allowNull: false })
  declare termDigest: string;

  @Column({ field: 'topic', type: DataType.TEXT, allowNull: false })
  declare topic: string;

  @Column({ field: 'tone', type: DataType.TEXT, allowNull: false })
  declare tone: string;

  @Column({ field: 'region', type: DataType.TEXT, allowNull: false })
  declare region: string;

  @Column({ field: 'read_at', type: DataType.DATE, allowNull: false })
  declare readAt: Date;
}
