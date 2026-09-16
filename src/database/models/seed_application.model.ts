import { CreationOptional, InferAttributes, InferCreationAttributes } from 'sequelize';
import { Column, DataType, Model, Table } from 'sequelize-typescript';

@Table({
  tableName: 'seed_application',
  schema: 'operations',
  timestamps: false,
  underscored: true,
})
export class SeedApplicationModel extends Model<
  InferAttributes<SeedApplicationModel>,
  InferCreationAttributes<SeedApplicationModel>
> {
  @Column({
    field: 'seed_application_id',
    type: DataType.UUID,
    allowNull: false,
    primaryKey: true,
    defaultValue: DataType.UUIDV4,
  })
  declare seedApplicationId: CreationOptional<string>;

  @Column({ field: 'database_identity', type: DataType.STRING(200), allowNull: false })
  declare databaseIdentity: string;

  @Column({ field: 'environment_id', type: DataType.STRING(60), allowNull: false })
  declare environmentId: string;

  @Column({ field: 'package_code', type: DataType.STRING(80), allowNull: false })
  declare packageCode: string;

  @Column({ field: 'package_version', type: DataType.STRING(40), allowNull: false })
  declare packageVersion: string;

  @Column({ field: 'checksum', type: DataType.CHAR(64), allowNull: false })
  declare checksum: string;

  @Column({ field: 'applied_commit', type: DataType.STRING(60), allowNull: true })
  declare appliedCommit: string | null;

  @Column({ field: 'applied_at', type: DataType.DATE, allowNull: false })
  declare appliedAt: Date;

  @Column({ field: 'summary_json', type: DataType.JSONB, allowNull: false })
  declare summaryJson: Record<string, unknown>;
}
