import { CreationOptional, InferAttributes, InferCreationAttributes } from 'sequelize';
import { Column, DataType, Model, Table } from 'sequelize-typescript';

@Table({ tableName: 'entity_alias', schema: 'intelligence', timestamps: false, underscored: true })
export class EntityAliasModel extends Model<
  InferAttributes<EntityAliasModel>,
  InferCreationAttributes<EntityAliasModel>
> {
  @Column({
    field: 'entity_alias_id',
    type: DataType.BIGINT,
    allowNull: false,
    primaryKey: true,
    autoIncrement: true,
  })
  declare entityAliasId: CreationOptional<string>;

  @Column({ field: 'economic_entity_id', type: DataType.UUID, allowNull: false })
  declare economicEntityId: string;

  @Column({ field: 'alias', type: DataType.STRING(250), allowNull: false })
  declare alias: string;

  @Column({ field: 'normalized_alias', type: DataType.STRING(250), allowNull: false })
  declare normalizedAlias: string;

  @Column({ field: 'alias_type', type: DataType.STRING(30), allowNull: false })
  declare aliasType: string;
}
