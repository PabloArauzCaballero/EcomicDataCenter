import {
  expandedPlaceFamilyView,
  expandedPlaceView,
} from '../migration-sql/0074-read-the-expanded-places.view';
import {
  dropLocatedPlaceViews,
  locatedPlaceFamilyView,
  locatedPlaceGrants,
  locatedPlaceIndexes,
  locatedPlaceView,
} from '../migration-sql/0084-locate-the-places-by-municipality.view';
import type { MigrationContext } from '../migration.types';

/**
 * Gives a municipality to the national places whose source named no town.
 *
 * Half of the national corpus arrived without a locality, and the report filed
 * it under «Sin localidad declarada». Measured on 2026-09-24, that pile held
 * 8.039 places inside the Santa Cruz metropolitan area — cash machines, bank
 * branches, restaurants — which is why the city looked thinner than it is.
 *
 * The municipality comes from containment in the COD-AB municipal layer, filed
 * by the national place load as its own observation (`PLACE_MUNICIPALITY`), and
 * this migration only teaches the view to join it. The place rows are untouched:
 * they are hashed and immutable, and rewriting one would have added a second.
 *
 * `city_place` is not named here, as 0074 did not name it: the three-city
 * corpus declares a city on every row.
 */

export async function up({ context }: MigrationContext): Promise<void> {
  await context.sequelize.query(dropLocatedPlaceViews);
  await context.sequelize.query(locatedPlaceView);
  await context.sequelize.query(locatedPlaceFamilyView);
  await context.sequelize.query(locatedPlaceIndexes);
  await context.sequelize.query(locatedPlaceGrants);
}

export async function down({ context }: MigrationContext): Promise<void> {
  await context.sequelize.query(dropLocatedPlaceViews);
  await context.sequelize.query(`
    DROP INDEX IF EXISTS intelligence.ix_raw_observation_place_municipality;
  `);
  await context.sequelize.query(expandedPlaceView);
  await context.sequelize.query(expandedPlaceFamilyView);
  await context.sequelize.query(locatedPlaceGrants);
}
