import {
  cityStreetIndexes,
  dropCityStreetIndexes,
  dropCityStreetViews,
  grants,
  roadStreetCellView,
  roadStreetIndexView,
} from '../migration-sql/0095-read-the-city-streets.view';
import type { MigrationContext } from '../migration.types';

/**
 * Opens the streets of the cities for reading, beside the road network.
 *
 * `road_street_cell` holds the geometry of the streets that are not the national
 * network, in cells of ~2.2 km, so the tablero asks only for the ones the screen
 * crosses. `road_street_index` holds, per city, every street name OpenStreetMap
 * gives it, so a search for «Panamericana» does not download any geometry.
 *
 * Nothing is rewritten: the road sections keep their view and their simplification.
 * The partial indexes are what make a cell cheap to read — see the view file.
 */

export async function up({ context }: MigrationContext): Promise<void> {
  await context.sequelize.query(cityStreetIndexes);
  await context.sequelize.query(dropCityStreetViews);
  await context.sequelize.query(roadStreetCellView);
  await context.sequelize.query(roadStreetIndexView);
  await context.sequelize.query(grants);
}

export async function down({ context }: MigrationContext): Promise<void> {
  await context.sequelize.query(dropCityStreetViews);
  await context.sequelize.query(dropCityStreetIndexes);
}
