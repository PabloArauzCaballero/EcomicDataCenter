import { CreationOptional, InferAttributes, InferCreationAttributes } from 'sequelize';
import { Column, DataType, Model, Table } from 'sequelize-typescript';

@Table({
  tableName: 'claim_cluster_member',
  schema: 'intelligence',
  timestamps: false,
  underscored: true,
})
export class ClaimClusterMemberModel extends Model<
  InferAttributes<ClaimClusterMemberModel>,
  InferCreationAttributes<ClaimClusterMemberModel>
> {
  @Column({
    field: 'claim_cluster_member_id',
    type: DataType.BIGINT,
    allowNull: false,
    primaryKey: true,
    autoIncrement: true,
  })
  declare claimClusterMemberId: CreationOptional<string>;

  @Column({ field: 'document_cluster_id', type: DataType.UUID, allowNull: false })
  declare documentClusterId: string;

  @Column({ field: 'fact_claim_id', type: DataType.UUID, allowNull: false })
  declare factClaimId: string;

  @Column({ field: 'similarity', type: DataType.DECIMAL(5, 4), allowNull: false })
  declare similarity: string;

  @Column({ field: 'joined_at', type: DataType.DATE, allowNull: false })
  declare joinedAt: Date;
}
