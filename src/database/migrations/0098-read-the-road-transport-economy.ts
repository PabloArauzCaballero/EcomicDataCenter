import { grantsOn } from '../migration-sql/0088-file-the-rail-and-river-networks.view';
import {
  dropRoadTransportIndexes,
  dropRoadTransportViews,
  gnvActivityView,
  intercityFareBandView,
  ROAD_TRANSPORT_VIEWS,
  roadTransportIndexes,
  vehicleFleetView,
} from '../migration-sql/0098-read-the-road-transport-economy.view';
import type { MigrationContext } from '../migration.types';

/** Publishes the INE vehicle/GNV history and ATT intercity fare bands. */
export async function up({ context }: MigrationContext): Promise<void> {
  await context.sequelize.query(dropRoadTransportViews);
  await context.sequelize.query(vehicleFleetView);
  await context.sequelize.query(gnvActivityView);
  await context.sequelize.query(intercityFareBandView);
  await context.sequelize.query(roadTransportIndexes);
  await context.sequelize.query(grantsOn(ROAD_TRANSPORT_VIEWS));
}

export async function down({ context }: MigrationContext): Promise<void> {
  await context.sequelize.query(dropRoadTransportViews);
  await context.sequelize.query(dropRoadTransportIndexes);
}
