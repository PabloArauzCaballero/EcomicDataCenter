import {
  dropPanelViews,
  panelCatalogueView,
  panelIndexes,
  panelReadingView,
} from '../migration-sql/0067-read-the-world-panel.view';
import type { MigrationContext } from '../migration.types';

/**
 * Opens the World Development Indicators panel for reading.
 *
 * The observatory carried a hundred and seventeen hand-picked annual series for
 * Bolivia. That was a reading list rather than a corpus: which hundred were
 * worth carrying was decided once, and every question outside them had no data
 * behind it. The collection itself holds fifteen hundred series on the same
 * definitions for every country, and the panel loader now brings all of them
 * for Bolivia and the twenty-nine economies it is read against.
 *
 * Two models. `world_panel_reading` is one row per country per year per
 * indicator — 1,28 million of them — kept apart from the older
 * `economic_indicator_reading` because a consumer of Bolivia's own measured
 * series should not start scanning a panel it never asked for.
 * `world_panel_catalogue` is the fifteen-hundred-row index a reader needs
 * before they can choose anything, materialised because grouping a million rows
 * on every page view is the failure the press models already learned once.
 *
 * `bolivia_years` sits beside `observations` in the catalogue for a reason: an
 * indicator with sixty years of data for its neighbours and none for Bolivia is
 * not a Bolivian series, and a catalogue ranked on row count alone would put it
 * at the top.
 *
 * Nothing here changes what the older models say. The panel is a different
 * corpus from a different request, and the two are joined by the reader who
 * wants both, not by a view that pretends they are one series.
 *
 * See ADR 0024.
 */

const grants = `
DO $$
DECLARE
  role_name text;
  view_name text;
BEGIN
  FOREACH role_name IN ARRAY ARRAY['backend_reader', 'backup_operator'] LOOP
    IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = role_name) THEN
      FOREACH view_name IN ARRAY ARRAY['world_panel_reading', 'world_panel_catalogue'] LOOP
        EXECUTE format('GRANT SELECT ON read_models.%I TO %I', view_name, role_name);
      END LOOP;
    END IF;
  END LOOP;
END;
$$;
`;

export async function up({ context }: MigrationContext): Promise<void> {
  await context.sequelize.query(dropPanelViews);
  await context.sequelize.query(panelReadingView);
  await context.sequelize.query(panelCatalogueView);
  await context.sequelize.query(panelIndexes);
  await context.sequelize.query(grants);
}

export async function down({ context }: MigrationContext): Promise<void> {
  await context.sequelize.query(dropPanelViews);
  await context.sequelize.query(`
    DROP INDEX IF EXISTS intelligence.ix_raw_observation_panel_indicator;
    DROP INDEX IF EXISTS intelligence.ix_raw_observation_panel_country;
  `);
}
