import { CreationOptional, InferAttributes, InferCreationAttributes } from 'sequelize';
import { Column, DataType, Model, Table } from 'sequelize-typescript';

@Table({
  tableName: 'document_cluster',
  schema: 'intelligence',
  timestamps: false,
  underscored: true,
})
export class DocumentClusterModel extends Model<
  InferAttributes<DocumentClusterModel>,
  InferCreationAttributes<DocumentClusterModel>
> {
  @Column({
    field: 'document_cluster_id',
    type: DataType.UUID,
    allowNull: false,
    primaryKey: true,
    defaultValue: DataType.UUIDV4,
  })
  declare documentClusterId: CreationOptional<string>;

  @Column({ field: 'representative_claim_id', type: DataType.UUID, allowNull: true })
  declare representativeClaimId: string | null;

  @Column({ field: 'cluster_fingerprint', type: DataType.CHAR(64), allowNull: false, unique: true })
  declare clusterFingerprint: string;

  @Column({ field: 'member_count', type: DataType.INTEGER, allowNull: false })
  declare memberCount: number;

  @Column({ field: 'first_seen_at', type: DataType.DATE, allowNull: false })
  declare firstSeenAt: Date;

  @Column({ field: 'last_seen_at', type: DataType.DATE, allowNull: false })
  declare lastSeenAt: Date;
}
