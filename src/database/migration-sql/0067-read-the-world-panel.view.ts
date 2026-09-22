/**
 * The panel models exactly as migration 0067 wrote them.
 *
 * A snapshot, never edited: a later change to how the panel is read is a later
 * migration with its own copy.
 */

export const dropPanelViews = `
DROP MATERIALIZED VIEW IF EXISTS read_models.world_panel_catalogue;
DROP VIEW IF EXISTS read_models.world_panel_reading;
`;

/**
 * Every figure the World Bank publishes for Bolivia and the economies it is
 * read against, one row per country per year per indicator.
 *
 * Kept apart from `economic_indicator_reading`, which is Bolivia's own measured
 * series and is what the exchange-rate and macro panels have always read. Two
 * reasons, and neither is tidiness. This corpus is a hundred times larger, so a
 * consumer that scans the older model would start scanning a million rows it
 * never asked for. And it is a panel: every row carries a country, which no
 * reader of the older model expects and none of them filter by.
 *
 * The value stays in the unit the publisher used, which differs series by
 * series — a ratio, a count, a constant-dollar total. Normalising here would
 * mean inventing a conversion the World Bank did not publish.
 */
export const panelReadingView = `
CREATE VIEW read_models.world_panel_reading AS
SELECT
  fc.fact_claim_id,
  ro.payload_json ->> 'country'              AS country,
  ro.payload_json ->> 'indicatorCode'        AS indicator_code,
  ro.payload_json ->> 'indicatorName'        AS indicator_name,
  (ro.payload_json ->> 'period')::int        AS period,
  (ro.payload_json #>> '{measures,0,value}')::numeric AS value,
  fc.event_date,
  ro.payload_json ->> 'publisher'            AS publisher,
  ro.payload_json ->> 'url'                  AS source_url,
  artifact.sha256                            AS evidence_sha256,
  fc.status,
  (fc.superseded_by_claim_id IS NOT NULL)    AS superseded
FROM intelligence.fact_claim fc
JOIN intelligence.raw_observation ro
  ON ro.raw_observation_id = fc.raw_observation_id
LEFT JOIN provenance.source_artifact artifact
  ON artifact.source_artifact_id = ro.source_artifact_id
WHERE ro.payload_json ->> 'dataCategory' = 'MACRO_PANEL';
`;

/**
 * One row per indicator: what it is, how much of it there is, and for whom.
 *
 * Materialised, and this one is not premature. A reader choosing an indicator
 * needs the list before they can ask for anything, and computing it means
 * grouping a million rows — nine seconds a page, which is the failure the press
 * models already learned. The catalogue is fifteen hundred rows and is rebuilt
 * by the same load that fills the panel.
 *
 * `bolivia_years` is separated from `years` on purpose. An indicator with sixty
 * years of Chilean data and none for Bolivia is not a Bolivian series, and a
 * catalogue that only counted rows would rank it as if it were.
 */
export const panelCatalogueView = `
CREATE MATERIALIZED VIEW read_models.world_panel_catalogue AS
SELECT
  indicator_code,
  max(indicator_name)                                      AS indicator_name,
  count(*)                                                 AS observations,
  count(DISTINCT country)                                  AS countries,
  min(period)                                              AS first_year,
  max(period)                                              AS last_year,
  count(*) FILTER (WHERE country = 'BOL')                  AS bolivia_years,
  max(period) FILTER (WHERE country = 'BOL')               AS bolivia_last_year,
  max(source_url)                                          AS source_url
FROM read_models.world_panel_reading
WHERE status = 'PUBLISHED' AND NOT superseded
GROUP BY indicator_code;
`;

/**
 * The indexes the panel is actually read through.
 *
 * A reader opens one indicator and wants every country in it, or opens one
 * country and wants its whole history. Both are covered; the unique index on
 * the claim is what lets the catalogue refresh concurrently.
 */
export const panelIndexes = `
CREATE UNIQUE INDEX IF NOT EXISTS ux_world_panel_catalogue_code
  ON read_models.world_panel_catalogue (indicator_code);
CREATE INDEX IF NOT EXISTS ix_world_panel_catalogue_bolivia
  ON read_models.world_panel_catalogue (bolivia_years DESC);
CREATE INDEX IF NOT EXISTS ix_raw_observation_panel_indicator
  ON intelligence.raw_observation ((payload_json ->> 'indicatorCode'))
  WHERE payload_json ->> 'dataCategory' = 'MACRO_PANEL';
CREATE INDEX IF NOT EXISTS ix_raw_observation_panel_country
  ON intelligence.raw_observation ((payload_json ->> 'country'))
  WHERE payload_json ->> 'dataCategory' = 'MACRO_PANEL';
`;
