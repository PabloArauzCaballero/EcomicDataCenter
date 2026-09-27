import {
  dropRoadNetworkViews,
  grants,
  roadLengthAnnualView,
  roadNetworkIndexes,
  roadSectionView,
} from '../migration-sql/0083-file-the-road-network.view';
import type { MigrationContext } from '../migration.types';

/**
 * Opens the road network for reading.
 *
 * ABC's Sistema de Información Vial and Transitabilidad were unreachable when
 * this corpus was built — the main site returned a WordPress error and the
 * transitability tool sat behind a captcha — so the geometry comes from
 * OpenStreetMap's own tracing of the country's motorways, trunk, primary and
 * secondary ways, cut at each department border into tramos of shared route,
 * rodadura and estado. The official kilometre count comes separately, from
 * the INE's annual table, which the INE itself credits to the ABC and the
 * departmental road services — the count this corpus could not fetch at the
 * source, read instead from the compiler that publishes it.
 *
 * Two views and neither one a series: `road_section` answers where a route
 * runs and what it is paved with, `road_length_annual` answers how many
 * kilometres, officially, by year. Kept apart because OpenStreetMap's
 * centreline kilometres and the INE's official count are not the same
 * measurement — one traces what has been mapped, the other counts what the
 * state has inventoried — and a single figure would hide which of the two a
 * reader was looking at.
 */

export async function up({ context }: MigrationContext): Promise<void> {
  await context.sequelize.query(dropRoadNetworkViews);
  await context.sequelize.query(roadSectionView);
  await context.sequelize.query(roadLengthAnnualView);
  await context.sequelize.query(roadNetworkIndexes);
  await context.sequelize.query(grants);
}

export async function down({ context }: MigrationContext): Promise<void> {
  await context.sequelize.query(dropRoadNetworkViews);
  await context.sequelize.query(`
    DROP INDEX IF EXISTS intelligence.ix_raw_observation_road_section;
    DROP INDEX IF EXISTS intelligence.ix_raw_observation_road_length;
  `);
}
