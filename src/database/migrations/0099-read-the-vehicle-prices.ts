import {
  dropVehiclePriceViews,
  vehiclePriceGrants,
  vehiclePriceIndex,
  vehiclePriceObservationView,
  vehiclePriceOfferView,
} from '../migration-sql/0099-read-the-vehicle-prices.view';
import type { MigrationContext } from '../migration.types';

export async function up({ context }: MigrationContext): Promise<void> {
  await context.sequelize.query(vehiclePriceIndex);
  await context.sequelize.query(dropVehiclePriceViews);
  await context.sequelize.query(vehiclePriceObservationView);
  await context.sequelize.query(vehiclePriceOfferView);
  await context.sequelize.query(vehiclePriceGrants);
}

export async function down({ context }: MigrationContext): Promise<void> {
  await context.sequelize.query(dropVehiclePriceViews);
  await context.sequelize.query('DROP INDEX IF EXISTS intelligence.ix_raw_observation_vehicle_price;');
}
