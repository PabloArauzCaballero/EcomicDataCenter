import type { MigrationContext } from '../migration.types';

/**
 * Turns the panel catalogue into a plain view, so it is never stale.
 *
 * Migration 0067 materialised it on the reasoning that grouping a million
 * observations per page view is what the press models already learned to avoid.
 * Measured, that reasoning does not hold here: the grouping answers in 460 ms
 * against the remote database, because the panel is written once per country
 * and read by an indexed aggregate rather than reassembled from evidence the
 * way an article is.
 *
 * Half a second is a page load. A snapshot costs more than that: it needs a
 * refresh after every load, and between the load and the refresh the report
 * serves a catalogue that no longer matches the corpus underneath it. A reader
 * who adds a country and does not see it has been told something false.
 *
 * The two press snapshots stay materialised, and the difference is measured
 * rather than assumed: `press_article` takes 4,4 s live because it reassembles
 * every note from its evidence, and `press_term_mention` takes 296 s because it
 * matches a hundred and twenty-three regular expressions against thirty-eight
 * thousand headlines. Neither is a page load, and the second exceeds every
 * timeout between the reader and the database.
 */

const liveCatalogue = `
DROP MATERIALIZED VIEW IF EXISTS read_models.world_panel_catalogue;
CREATE VIEW read_models.world_panel_catalogue AS
SELECT
  indicator_code,
  max(indicator_name)                        AS indicator_name,
  count(*)                                   AS observations,
  count(DISTINCT country)                    AS countries,
  min(period)                                AS first_year,
  max(period)                                AS last_year,
  count(*) FILTER (WHERE country = 'BOL')    AS bolivia_years,
  max(period) FILTER (WHERE country = 'BOL') AS bolivia_last_year,
  max(source_url)                            AS source_url
FROM read_models.world_panel_reading
WHERE status = 'PUBLISHED' AND NOT superseded
GROUP BY indicator_code;
`;

const grants = `
DO $$
DECLARE
  role_name text;
BEGIN
  FOREACH role_name IN ARRAY ARRAY['backend_reader', 'backup_operator'] LOOP
    IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = role_name) THEN
      EXECUTE format('GRANT SELECT ON read_models.world_panel_catalogue TO %I', role_name);
    END IF;
  END LOOP;
END;
$$;
`;

export async function up({ context }: MigrationContext): Promise<void> {
  await context.sequelize.query(liveCatalogue);
  await context.sequelize.query(grants);
}

/** Rolling back returns the stored copy, which then needs its first refresh. */
export async function down({ context }: MigrationContext): Promise<void> {
  await context.sequelize.query(`DROP VIEW IF EXISTS read_models.world_panel_catalogue;`);
}
