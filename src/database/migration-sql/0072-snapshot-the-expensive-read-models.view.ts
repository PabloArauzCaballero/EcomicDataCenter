/**
 * The source register, as migration 0072 wrote it.
 *
 * A snapshot of the definition, never edited: a later change to how a source is
 * counted is a later migration carrying its own copy, so rolling forward and
 * back always replays what that step actually applied.
 *
 * The aggregate itself is not new. It lived in the dashboard, which sent this
 * GROUP BY over the whole reading view on every page load. It belongs here for
 * the same reason every other figure does: two consumers must not be able to
 * disagree about how many readings a publisher has, and a model that is only a
 * query in one reader cannot be snapshotted, indexed or granted.
 */
export const sourceNoteView = `
CREATE VIEW read_models.indicator_source_note AS
SELECT
  publisher,
  indicator_code,
  max(indicator_name)             AS indicator_name,
  max(unit)                       AS unit,
  max(frequency)                  AS frequency,
  count(*)                        AS readings,
  count(DISTINCT source_url)      AS documents,
  min(source_url)                 AS source_url,
  min(event_date)                 AS first_day,
  max(event_date)                 AS last_day
FROM read_models.economic_indicator_reading
WHERE status = 'PUBLISHED' AND NOT superseded
GROUP BY publisher, indicator_code;
`;

/**
 * The stored output of the four read models that no longer answer in time.
 *
 * Each one is `SELECT *` over the view above it, which stays exactly as it is:
 * the view remains the definition, the thing to read to know how a figure was
 * derived. What is added is its output, indexed. Nothing about the derivation
 * changes; only how often it is paid for.
 *
 * `WITH NO DATA` on purpose. Building four of these inside the migration would
 * put minutes of sorting — and the spill room it needs — between a deploy and
 * an API that can start, on a server that has already refused one of these
 * queries for want of disk. Empty, they cost nothing to create, and the refresh
 * that fills them is a step that can fail on its own without holding the core
 * down with it. Until that refresh runs the snapshots are unscannable, which
 * `read_models.snapshot_state` reports and the readers treat as an absent
 * section rather than as an empty corpus.
 */
export const expensiveSnapshots = `
CREATE MATERIALIZED VIEW read_models.indicator_source_note_snapshot AS
  SELECT * FROM read_models.indicator_source_note
  WITH NO DATA;

CREATE MATERIALIZED VIEW read_models.macro_indicator_annual_snapshot AS
  SELECT * FROM read_models.macro_indicator_annual
  WITH NO DATA;

CREATE MATERIALIZED VIEW read_models.company_filing_snapshot AS
  SELECT * FROM read_models.company_filing
  WITH NO DATA;

CREATE MATERIALIZED VIEW read_models.world_panel_catalogue_snapshot AS
  SELECT * FROM read_models.world_panel_catalogue
  WITH NO DATA;
`;

/**
 * A unique index on each snapshot, and the ones a reader pages by.
 *
 * The unique index is not decoration: `REFRESH ... CONCURRENTLY` requires one,
 * and without it every rebuild takes an exclusive lock and the report stops
 * answering for the minutes the rebuild lasts.
 *
 * Each key is the grain the view already guarantees. The source register is one
 * row per publisher and indicator, because that is what it groups by. The
 * annual series is one row per indicator, period and unit — the same three
 * columns its own GROUP BY uses, plus the statistic that separates a closed
 * year from a year to date. A filing is its claim. A catalogue entry is its
 * indicator. If any of those turned out not to be unique the refresh would say
 * so loudly instead of quietly serving duplicates, which is the behaviour to
 * want from a key.
 */
export const snapshotIndexes = `
CREATE UNIQUE INDEX ux_source_note_snapshot
  ON read_models.indicator_source_note_snapshot (publisher, indicator_code);

CREATE UNIQUE INDEX ux_macro_annual_snapshot
  ON read_models.macro_indicator_annual_snapshot (indicator_code, period, unit, statistic);
CREATE INDEX ix_macro_annual_snapshot_sector
  ON read_models.macro_indicator_annual_snapshot (sector, indicator_code);

CREATE UNIQUE INDEX ux_company_filing_snapshot
  ON read_models.company_filing_snapshot (fact_claim_id);
CREATE INDEX ix_company_filing_snapshot_date
  ON read_models.company_filing_snapshot (published_at DESC NULLS LAST, event_date DESC);

CREATE UNIQUE INDEX ux_world_panel_catalogue_snapshot
  ON read_models.world_panel_catalogue_snapshot (indicator_code);
CREATE INDEX ix_world_panel_catalogue_snapshot_bolivia
  ON read_models.world_panel_catalogue_snapshot (bolivia_years DESC);
`;

/**
 * Whether each stored copy has been filled, and when.
 *
 * A materialised view created `WITH NO DATA` raises 55000 on any read, and a
 * refreshed one that happens to be empty returns no rows. Those are opposite
 * facts — «nobody has built this yet» and «there is nothing to show» — and a
 * reader that cannot tell them apart publishes the first as the second, which
 * is the mistake this whole report has been making in one form or another for
 * a week. `pg_class.relispopulated` is the server's own answer, and this view
 * is where a reader outside the server asks for it.
 */
export const snapshotState = `
CREATE VIEW read_models.snapshot_state AS
SELECT
  c.relname::text                                   AS snapshot,
  c.relispopulated                                  AS built,
  pg_catalog.pg_total_relation_size(c.oid)          AS bytes,
  s.last_refresh
FROM pg_catalog.pg_class c
JOIN pg_catalog.pg_namespace n ON n.oid = c.relnamespace
LEFT JOIN LATERAL (
  SELECT greatest(st.last_autoanalyze, st.last_analyze) AS last_refresh
  FROM pg_catalog.pg_stat_all_tables st
  WHERE st.relid = c.oid
) s ON true
WHERE n.nspname = 'read_models' AND c.relkind = 'm';
`;

/** The models this migration adds, for the grant loop and for the undo. */
export const addedModels = [
  'read_models.indicator_source_note',
  'read_models.indicator_source_note_snapshot',
  'read_models.macro_indicator_annual_snapshot',
  'read_models.company_filing_snapshot',
  'read_models.world_panel_catalogue_snapshot',
  'read_models.snapshot_state',
] as const;

export const dropAdded = `
DROP VIEW IF EXISTS read_models.snapshot_state;
DROP MATERIALIZED VIEW IF EXISTS read_models.world_panel_catalogue_snapshot;
DROP MATERIALIZED VIEW IF EXISTS read_models.company_filing_snapshot;
DROP MATERIALIZED VIEW IF EXISTS read_models.macro_indicator_annual_snapshot;
DROP MATERIALIZED VIEW IF EXISTS read_models.indicator_source_note_snapshot;
DROP VIEW IF EXISTS read_models.indicator_source_note;
`;
