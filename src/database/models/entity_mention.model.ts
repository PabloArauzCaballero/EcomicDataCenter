import { CreationOptional, InferAttributes, InferCreationAttributes } from 'sequelize';
import { Column, DataType, Model, Table } from 'sequelize-typescript';

@Table({
  tableName: 'entity_mention',
  schema: 'intelligence',
  timestamps: false,
  underscored: true,
})
export class EntityMentionModel extends Model<
  InferAttributes<EntityMentionModel>,
  InferCreationAttributes<EntityMentionModel>
> {
  @Column({
    field: 'entity_mention_id',
    type: DataType.BIGINT,
    allowNull: false,
    primaryKey: true,
    autoIncrement: true,
  })
  declare entityMentionId: CreationOptional<string>;

  @Column({ field: 'fact_claim_id', type: DataType.UUID, allowNull: false })
  declare factClaimId: string;

  @Column({ field: 'economic_entity_id', type: DataType.UUID, allowNull: true })
  declare economicEntityId: string | null;

  @Column({ field: 'mention_text', type: DataType.STRING(250), allowNull: false })
  declare mentionText: string;

  @Column({ field: 'resolution_method', type: DataType.STRING(30), allowNull: false })
  declare resolutionMethod: string;

  @Column({ field: 'resolution_confidence', type: DataType.DECIMAL(5, 4), allowNull: true })
  declare resolutionConfidence: string | null;
}
