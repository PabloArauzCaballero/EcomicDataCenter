import { CreationOptional, InferAttributes, InferCreationAttributes } from 'sequelize';
import { Column, DataType, Model, Table } from 'sequelize-typescript';

@Table({ tableName: 'fact_claim', schema: 'intelligence', timestamps: false, underscored: true })
export class FactClaimModel extends Model<
  InferAttributes<FactClaimModel>,
  InferCreationAttributes<FactClaimModel>
> {
  @Column({
    field: 'fact_claim_id',
    type: DataType.UUID,
    allowNull: false,
    primaryKey: true,
    defaultValue: DataType.UUIDV4,
  })
  declare factClaimId: CreationOptional<string>;

  @Column({ field: 'agent_run_id', type: DataType.UUID, allowNull: false })
  declare agentRunId: string;

  @Column({ field: 'raw_observation_id', type: DataType.BIGINT, allowNull: true })
  declare rawObservationId: string | null;

  @Column({ field: 'statistical_domain_id', type: DataType.UUID, allowNull: true })
  declare statisticalDomainId: string | null;

  @Column({ field: 'geographic_unit_id', type: DataType.UUID, allowNull: true })
  declare geographicUnitId: string | null;

  @Column({ field: 'economic_entity_id', type: DataType.UUID, allowNull: true })
  declare economicEntityId: string | null;

  @Column({ field: 'superseded_by_claim_id', type: DataType.UUID, allowNull: true })
  declare supersededByClaimId: string | null;

  @Column({ field: 'claim_type', type: DataType.STRING(40), allowNull: false })
  declare claimType: string;

  @Column({ field: 'assertion', type: DataType.TEXT, allowNull: false })
  declare assertion: string;

  @Column({ field: 'event_date', type: DataType.DATEONLY, allowNull: true })
  declare eventDate: string | null;

  @Column({ field: 'published_at', type: DataType.DATE, allowNull: true })
  declare publishedAt: Date | null;

  @Column({ field: 'time_horizon', type: DataType.STRING(30), allowNull: true })
  declare timeHorizon: string | null;

  @Column({ field: 'impact_level', type: DataType.STRING(20), allowNull: true })
  declare impactLevel: string | null;

  @Column({ field: 'probability', type: DataType.DECIMAL(5, 4), allowNull: true })
  declare probability: string | null;

  @Column({ field: 'confidence_level', type: DataType.STRING(20), allowNull: false })
  declare confidenceLevel: string;

  @Column({ field: 'confidence_score', type: DataType.DECIMAL(5, 4), allowNull: true })
  declare confidenceScore: string | null;

  @Column({ field: 'status', type: DataType.STRING(30), allowNull: false })
  declare status: string;

  @Column({ field: 'content_hash', type: DataType.CHAR(64), allowNull: false })
  declare contentHash: string;

  @Column({ field: 'created_at', type: DataType.DATE, allowNull: false })
  declare createdAt: Date;
}
