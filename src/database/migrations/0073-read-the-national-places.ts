import {
  dropNationalPlaceViews,
  nationalPlaceFamilyView,
  nationalPlaceIndexes,
  nationalPlaceView,
} from '../migration-sql/0073-read-the-national-places.view';
import type { MigrationContext } from '../migration.types';

/**
 * Opens the places of the whole country for reading.
 *
 * Migration 0070 opened three cities: twenty-six thousand places from one
 * publisher, inside the division polygons Overture draws for each municipality.
 * This one opens Bolivia — fifty-one thousand more places that corpus did not
 * hold, read from Overture and from OpenStreetMap together, bounded by the
 * country polygon.
 *
 * Two views, and neither of them touches the three-city models. The corpus that
 * arrived overlaps that one heavily: 24.563 of its 37.278 Overture records are
 * places the observatory already holds, and they were removed by identifier
 * when the seed was built rather than here, because the loader is idempotent by
 * payload hash and these payloads have a different shape. What lands is what
 * was genuinely new.
 *
 * The reason the country is a second model instead of a wider first one is that
 * it cannot answer the question the first one is named for. `city_place` has a
 * city on every row; this corpus has one on none. The delivery publishes no
 * city and no department — its `region` column is empty for 36.991 of 37.278
 * Overture records and holds `S`, `L` or `H` in most of the remainder, and the
 * OpenStreetMap half carries no locality at all. What it does carry is the town
 * name Overture printed in the address, which is kept as `locality` and called
 * nothing else. Deriving a department from the coordinates would need division
 * polygons that are not in the delivery, and a bounding box would be wrong
 * along every border it crossed.
 *
 * Nothing here changes what any other model says, the three-city report
 * included. These rows carry no period and no value; they are joined to the
 * rest of the observatory by a reader asking about a place, not by a view that
 * pretends a shop is a series.
 */

const grants = `
DO $$
DECLARE
  role_name text;
  view_name text;
BEGIN
  FOREACH role_name IN ARRAY ARRAY['backend_reader', 'backup_operator'] LOOP
    IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = role_name) THEN
      FOREACH view_name IN ARRAY ARRAY['national_place', 'national_place_family'] LOOP
        EXECUTE format('GRANT SELECT ON read_models.%I TO %I', view_name, role_name);
      END LOOP;
    END IF;
  END LOOP;
END;
$$;
`;

export async function up({ context }: MigrationContext): Promise<void> {
  await context.sequelize.query(dropNationalPlaceViews);
  await context.sequelize.query(nationalPlaceView);
  await context.sequelize.query(nationalPlaceFamilyView);
  await context.sequelize.query(nationalPlaceIndexes);
  await context.sequelize.query(grants);
}

export async function down({ context }: MigrationContext): Promise<void> {
  await context.sequelize.query(dropNationalPlaceViews);
  await context.sequelize.query(`
    DROP INDEX IF EXISTS intelligence.ix_raw_observation_national_poi;
    DROP INDEX IF EXISTS intelligence.ix_raw_observation_national_locality;
  `);
}
