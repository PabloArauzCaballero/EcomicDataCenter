import { CreationOptional, InferAttributes, InferCreationAttributes } from 'sequelize';
import { Column, DataType, Model, Table } from 'sequelize-typescript';

@Table({
  tableName: 'claim_evidence',
  schema: 'intelligence',
  timestamps: false,
  underscored: true,
})
export class ClaimEvidenceModel extends Model<
  InferAttributes<ClaimEvidenceModel>,
  InferCreationAttributes<ClaimEvidenceModel>
> {
  @Column({
    field: 'claim_evidence_id',
    type: DataType.BIGINT,
    allowNull: false,
    primaryKey: true,
    autoIncrement: true,
  })
  declare claimEvidenceId: CreationOptional<string>;

  @Column({ field: 'fact_claim_id', type: DataType.UUID, allowNull: false })
  declare factClaimId: string;

  @Column({ field: 'source_artifact_id', type: DataType.UUID, allowNull: false })
  declare sourceArtifactId: string;

  @Column({ field: 'excerpt', type: DataType.TEXT, allowNull: false })
  declare excerpt: string;

  @Column({ field: 'excerpt_hash', type: DataType.CHAR(64), allowNull: false })
  declare excerptHash: string;

  @Column({ field: 'locator', type: DataType.TEXT, allowNull: true })
  declare locator: string | null;

  @Column({ field: 'retrieved_at', type: DataType.DATE, allowNull: false })
  declare retrievedAt: Date;
}
