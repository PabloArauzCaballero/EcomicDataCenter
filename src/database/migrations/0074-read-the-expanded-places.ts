import {
  nationalPlaceFamilyView,
  nationalPlaceView,
} from '../migration-sql/0073-read-the-national-places.view';
import {
  dropExpandedPlaceViews,
  expandedPlaceFamilyView,
  expandedPlaceIndexes,
  expandedPlaceView,
} from '../migration-sql/0074-read-the-expanded-places.view';
import type { MigrationContext } from '../migration.types';

/**
 * Makes room in the place models for a second delivery.
 *
 * Migration 0073 opened the country for reading from one delivery, and that
 * delivery knew no department for any of its places, dated everything by an
 * Overture release, and had no way to suspect that one of its rows was a shop
 * the observatory already held. A second delivery — 5.721 places of Cochabamba
 * and La Paz read live from OpenStreetMap — knows all three, so the views are
 * republished to carry them rather than quietly dropping what arrived.
 *
 * `department` is a membership in an OpenStreetMap administrative area and the
 * delivery says so in the same breath: `no_limite_certificado`. It is not the
 * state's boundary and the column must not be read as one.
 *
 * `resembles_held_place_id` is the column that matters most for a reader who
 * counts. The two corpora cannot collide by identifier — one is Overture, the
 * other OpenStreetMap — so nothing upstream could have caught that «Heladería
 * Dumbo» and «Dumbo», five metres apart, are one ice-cream shop. Ninety-five
 * such rows are flagged and none is merged: merging deletes a real second
 * branch on the same block, which is the judgement the three-city corpus
 * already made and this one has no reason to overturn.
 *
 * Nothing here touches `city_place` or `city_place_family`. They are not
 * dropped, not recreated and not named in any statement this migration runs,
 * so the three-city report reads exactly what it read before — and a rollback
 * restores 0073's own text of the national views, not a paraphrase of it.
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
  await context.sequelize.query(dropExpandedPlaceViews);
  await context.sequelize.query(expandedPlaceView);
  await context.sequelize.query(expandedPlaceFamilyView);
  await context.sequelize.query(expandedPlaceIndexes);
  await context.sequelize.query(grants);
}

export async function down({ context }: MigrationContext): Promise<void> {
  await context.sequelize.query(dropExpandedPlaceViews);
  await context.sequelize.query(`
    DROP INDEX IF EXISTS intelligence.ix_raw_observation_national_department;
  `);
  await context.sequelize.query(nationalPlaceView);
  await context.sequelize.query(nationalPlaceFamilyView);
  await context.sequelize.query(grants);
}
