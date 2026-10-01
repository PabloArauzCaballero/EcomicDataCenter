import { CreationOptional, InferAttributes, InferCreationAttributes } from 'sequelize';
import { Column, DataType, Model, Table } from 'sequelize-typescript';

@Table({
  tableName: 'press_claim_term',
  schema: 'intelligence',
  timestamps: false,
  underscored: true,
})
export class PressClaimTermModel extends Model<
  InferAttributes<PressClaimTermModel>,
  InferCreationAttributes<PressClaimTermModel>
> {
  @Column({ field: 'fact_claim_id', type: DataType.UUID, allowNull: false })
  declare factClaimId: string;

  @Column({ field: 'term', type: DataType.TEXT, allowNull: false })
  declare term: string;

  @Column({ field: 'label', type: DataType.TEXT, allowNull: false })
  declare label: string;

  @Column({ field: 'family', type: DataType.TEXT, allowNull: false })
  declare family: string;
}
