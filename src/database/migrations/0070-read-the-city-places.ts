import {
  cityPlaceFamilyView,
  cityPlaceView,
  dropPlaceViews,
  placeIndexes,
} from '../migration-sql/0070-read-the-city-places.view';
import type { MigrationContext } from '../migration.types';

/**
 * Opens the places of Santa Cruz, La Paz and Cochabamba for reading.
 *
 * Every model the observatory had until now answers «how much, and when». None
 * of them answers «what is there, and where» — and the informal-trade models
 * that tried were readings about commerce, not a register of premises. This is
 * the first corpus in the observatory whose rows are places: twenty-six
 * thousand of them, bounded by the division polygons Overture draws for each
 * municipality rather than by a rectangle, because a rectangle over La Paz
 * takes in El Alto and they are not the same city.
 *
 * Two views. `city_place` is one row per place, and `city_place_family` is the
 * count of each family in each city with how many of them a Bolivian regulator
 * licenses. The second is a plain view: twenty-six thousand rows group in
 * milliseconds, and a materialised view here would only add a refresh to
 * forget.
 *
 * The classification is derived from the publisher's own taxonomy into 201
 * families, and a place that matches none of them stays as `OTRA_ENTIDAD` with
 * its native taxonomy rather than being dropped so the families look complete.
 * It is the largest family in the corpus, and the views do not hide it.
 *
 * Nothing here changes what any other model says. These rows carry no period
 * and no value; they are joined to the rest of the observatory by a reader
 * asking about a city, not by a view that pretends a shop is a series.
 */

const grants = `
DO $$
DECLARE
  role_name text;
  view_name text;
BEGIN
  FOREACH role_name IN ARRAY ARRAY['backend_reader', 'backup_operator'] LOOP
    IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = role_name) THEN
      FOREACH view_name IN ARRAY ARRAY['city_place', 'city_place_family'] LOOP
        EXECUTE format('GRANT SELECT ON read_models.%I TO %I', view_name, role_name);
      END LOOP;
    END IF;
  END LOOP;
END;
$$;
`;

export async function up({ context }: MigrationContext): Promise<void> {
  await context.sequelize.query(dropPlaceViews);
  await context.sequelize.query(cityPlaceView);
  await context.sequelize.query(cityPlaceFamilyView);
  await context.sequelize.query(placeIndexes);
  await context.sequelize.query(grants);
}

export async function down({ context }: MigrationContext): Promise<void> {
  await context.sequelize.query(dropPlaceViews);
  await context.sequelize.query(`
    DROP INDEX IF EXISTS intelligence.ix_raw_observation_city_poi;
    DROP INDEX IF EXISTS intelligence.ix_raw_observation_poi_city;
  `);
}
