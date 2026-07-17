import { CreationOptional, InferAttributes, InferCreationAttributes } from 'sequelize';
import { Column, DataType, Model, Table } from 'sequelize-typescript';

@Table({ tableName: 'statistical_operation', schema: 'metadata', timestamps: false, underscored: true })
export class StatisticalOperationModel extends Model<
  InferAttributes<StatisticalOperationModel>,
  InferCreationAttributes<StatisticalOperationModel>
> {
  @Column({ field: 'statistical_operation_id', type: DataType.UUID, allowNull: false, primaryKey: true, defaultValue: DataType.UUIDV4 })
  declare statisticalOperationId: CreationOptional<string>;

  @Column({ field: 'producer_organization_id', type: DataType.UUID, allowNull: false })
  declare producerOrganizationId: string;

  @Column({ field: 'code', type: DataType.STRING(80), allowNull: false })
  declare code: string;

  @Column({ field: 'name', type: DataType.STRING(250), allowNull: false })
  declare name: string;

  @Column({ field: 'operation_type', type: DataType.STRING(40), allowNull: false })
  declare operationType: string;

  @Column({ field: 'objective', type: DataType.TEXT, allowNull: false })
  declare objective: string;

  @Column({ field: 'population_scope', type: DataType.TEXT, allowNull: true })
  declare populationScope: string | null;

  @Column({ field: 'geographic_scope', type: DataType.TEXT, allowNull: true })
  declare geographicScope: string | null;

  @Column({ field: 'collection_method', type: DataType.TEXT, allowNull: true })
  declare collectionMethod: string | null;

  @Column({ field: 'start_date', type: DataType.DATEONLY, allowNull: true })
  declare startDate: string | null;

  @Column({ field: 'end_date', type: DataType.DATEONLY, allowNull: true })
  declare endDate: string | null;

  @Column({ field: 'status', type: DataType.STRING(30), allowNull: false })
  declare status: string;

}
