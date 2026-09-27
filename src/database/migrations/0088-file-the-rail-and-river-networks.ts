import {
  dropTransportIndexes,
  dropTransportViews,
  grantsOn,
  railFlowView,
  railLineView,
  railStationView,
  roadSectionView,
  roadSectionViewBefore,
  TRANSPORT_VIEWS,
  transportIndexes,
  waterPortView,
  waterwayLineView,
} from '../migration-sql/0088-file-the-rail-and-river-networks.view';
import type { MigrationContext } from '../migration.types';

/**
 * Opens the rail and river networks for reading, beside the road network.
 *
 * The geometry comes from the Geofabrik extract the roads are read from:
 * OpenStreetMap's trunk rail lines, stations, rivers, ferry crossings and
 * ports, cut at the same department borders. The count comes from the INE:
 * passengers and tonnes the Red Andina and the Red Oriental carried each month
 * since 1999. Navigability is not asserted by OpenStreetMap, so each river
 * carries the category that says who claims it — the Ministry of Public
 * Works' waterways, the tributaries it studies, OpenStreetMap's `boat=yes`,
 * or none.
 *
 * And `road_section` learns to show one extract. The loaders only add, so the
 * 2026-09-26 reading landed beside the 2026-09-22 one; without the snapshot
 * rule the map would draw each road twice and its total would count it twice.
 */

export async function up({ context }: MigrationContext): Promise<void> {
  await context.sequelize.query(roadSectionView);
  await context.sequelize.query(dropTransportViews);
  await context.sequelize.query(railLineView);
  await context.sequelize.query(railStationView);
  await context.sequelize.query(railFlowView);
  await context.sequelize.query(waterwayLineView);
  await context.sequelize.query(waterPortView);
  await context.sequelize.query(transportIndexes);
  await context.sequelize.query(grantsOn(['road_section', ...TRANSPORT_VIEWS]));
}

export async function down({ context }: MigrationContext): Promise<void> {
  await context.sequelize.query(dropTransportViews);
  await context.sequelize.query(dropTransportIndexes);
  await context.sequelize.query(roadSectionViewBefore);
  await context.sequelize.query(grantsOn(['road_section']));
}
