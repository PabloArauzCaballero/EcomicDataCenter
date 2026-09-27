/**
 * The customs register of the statistics institute, laid out for reading.
 *
 * The `ine-trade` seeder files each year as one observation per grain whose
 * payload carries the whole cube as positional rows (`columns` names them; the
 * seed schema pins them to the order read here). Three stored copies turn that
 * into something a report can filter and group without unpacking JSON on every
 * visit:
 *
 * - `trade_flow`: one row per cube row of the newest block of each flow, grain
 *   and year. `X_DETAIL` is exports by NANDINA line, country, department, month
 *   and kind of flow; `M_DETAIL` is imports by line and country for the year
 *   (month 0); `M_MONTHLY` is imports by economic use, chapter, department and
 *   month. `usd` is FOB for exports and CIF at the border for imports — the
 *   value each flow is officially reported in — and `fob_usd` carries the FOB
 *   of imports beside it.
 * - `trade_product`: every NANDINA line with its chapter, section and the
 *   classifications the institute attaches to it.
 * - `trade_code`: the small code lists (countries, departments, sections,
 *   activities, traditional/non-traditional, economic use, GCE, CUCI, CIIU).
 *
 * Newest block wins, as everywhere else in this corpus: a provisional year the
 * institute revises arrives as a new observation and replaces the figures on
 * screen, while the one it replaced stays as evidence.
 *
 * Created `WITH NO DATA` for the reason 0072 and 0085 give: filling them here
 * would put the expansion of a million rows between a deploy and a core that
 * can start. The seed run fills them after loading, and the API fills whatever
 * is still unbuilt right after it starts listening.
 */

const DROP = (name: string): string => `
DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM pg_catalog.pg_class c
      JOIN pg_catalog.pg_namespace n ON n.oid = c.relnamespace
     WHERE n.nspname = 'read_models' AND c.relname = '${name}' AND c.relkind = 'm'
  ) THEN
    EXECUTE 'DROP MATERIALIZED VIEW read_models.${name}';
  END IF;
END;
$$;
`;

export const dropTradeModels = ['trade_flow', 'trade_product', 'trade_code'].map(DROP).join('');

/**
 * The published observations of one data category, with the scalars a copy
 * needs pulled out of the payload once.
 *
 * That «once» is the whole performance of these copies. A block's payload is
 * megabytes of JSON stored compressed out of line; an expression such as
 * `payload_json ->> 'grain'` in the outer select list is evaluated for every
 * row the block expands into, and each evaluation decompresses the whole
 * payload again. Measured on the first build: over ten minutes for seven
 * hundred thousand rows, against seconds once the scalars — and the one array
 * that is expanded — are extracted here and the CTE is materialised.
 */
const candidates = (category: string, fields: string): string => `
  SELECT ro.raw_observation_id, ro.received_at, ${fields}
  FROM intelligence.fact_claim fc
  JOIN intelligence.raw_observation ro
    ON ro.raw_observation_id = fc.raw_observation_id
  WHERE ro.payload_json ->> 'dataCategory' = '${category}'
    AND fc.status = 'PUBLISHED'
    AND fc.superseded_by_claim_id IS NULL
`;

const BLOCK = `
  SELECT DISTINCT ON (flow, grain, year)
    raw_observation_id, flow, grain, year, provisional, cells
  FROM (${candidates(
    'TRADE_RECORD',
    `ro.payload_json ->> 'flow' AS flow,
    ro.payload_json ->> 'grain' AS grain,
    (ro.payload_json ->> 'year')::smallint AS year,
    (ro.payload_json ->> 'provisional')::boolean AS provisional,
    ro.payload_json -> 'rows' AS cells`,
  )}) candidate
  ORDER BY flow, grain, year, received_at DESC, raw_observation_id DESC
`;

const CATALOGUE_KEYS = [
  'products',
  'chapters',
  'sections',
  'activities',
  'traditional',
  'uses',
  'gce',
  'cuci',
  'ciiu',
  'countries',
  'departments',
] as const;

const CATALOGUE = `
  SELECT ${CATALOGUE_KEYS.join(', ')}
  FROM (${candidates(
    'TRADE_CATALOGUE',
    CATALOGUE_KEYS.map((key) => `ro.payload_json -> '${key}' AS ${key}`).join(', '),
  )}) candidate
  ORDER BY received_at DESC, raw_observation_id DESC
  LIMIT 1
`;

const code = (position: number): string => `NULLIF(item.cell ->> ${position}, '')`;
const amount = (position: number): string => `(item.cell ->> ${position})::numeric`;

export const tradeFlowSnapshot = `
CREATE MATERIALIZED VIEW read_models.trade_flow AS
WITH block AS MATERIALIZED (${BLOCK})
SELECT
  block.raw_observation_id,
  item.position,
  block.flow,
  block.grain,
  block.year,
  block.provisional,
  CASE block.grain
    WHEN 'M_DETAIL' THEN 0::smallint
    ELSE ${code(0)}::smallint
  END                                                   AS month,
  CASE block.grain
    WHEN 'X_DETAIL' THEN ${code(1)}
    WHEN 'M_DETAIL' THEN ${code(0)}
  END                                                   AS nandina,
  CASE block.grain
    WHEN 'X_DETAIL' THEN left(item.cell ->> 1, 2)
    WHEN 'M_DETAIL' THEN left(item.cell ->> 0, 2)
    ELSE ${code(2)}
  END                                                   AS chapter,
  CASE block.grain
    WHEN 'X_DETAIL' THEN ${code(2)}
    WHEN 'M_DETAIL' THEN ${code(1)}
  END                                                   AS country,
  CASE block.grain
    WHEN 'X_DETAIL' THEN ${code(3)}
    WHEN 'M_MONTHLY' THEN ${code(3)}
  END                                                   AS department,
  CASE block.grain
    WHEN 'X_DETAIL' THEN ${code(4)}::smallint
  END                                                   AS kind,
  CASE block.grain
    WHEN 'M_MONTHLY' THEN ${code(1)}
  END                                                   AS use_code,
  CASE block.grain
    WHEN 'X_DETAIL' THEN ${amount(5)}
    WHEN 'M_DETAIL' THEN ${amount(2)}
    ELSE ${amount(4)}
  END                                                   AS usd,
  CASE block.grain
    WHEN 'M_DETAIL' THEN ${amount(3)}
    WHEN 'M_MONTHLY' THEN ${amount(5)}
  END                                                   AS fob_usd,
  CASE block.grain
    WHEN 'X_DETAIL' THEN ${amount(6)}
    WHEN 'M_DETAIL' THEN ${amount(4)}
    ELSE ${amount(6)}
  END                                                   AS kg,
  CASE block.grain
    WHEN 'X_DETAIL' THEN ${amount(7)}
  END                                                   AS fine_kg
FROM block
CROSS JOIN LATERAL jsonb_array_elements(block.cells)
  WITH ORDINALITY AS item(cell, position)
WITH NO DATA;
`;

export const tradeProductSnapshot = `
CREATE MATERIALIZED VIEW read_models.trade_product AS
WITH catalogue AS MATERIALIZED (${CATALOGUE})
SELECT
  product.key                                                        AS nandina,
  product.value ->> 'name'                                           AS name,
  product.value ->> 'chapter'                                        AS chapter,
  catalogue.chapters -> (product.value ->> 'chapter') ->> 'name'    AS chapter_name,
  catalogue.chapters -> (product.value ->> 'chapter') ->> 'section' AS section,
  product.value ->> 'activity'                                       AS activity,
  product.value ->> 'tnt'                                            AS traditional,
  product.value ->> 'use'                                            AS use_code,
  product.value ->> 'gce'                                            AS gce,
  product.value ->> 'cuci'                                           AS cuci,
  product.value ->> 'ciiu'                                           AS ciiu
FROM catalogue
CROSS JOIN LATERAL jsonb_each(catalogue.products) AS product(key, value)
WITH NO DATA;
`;

/**
 * The code lists, one row per dimension and code. `parent` is the grouping
 * the institute gives a code — the activity sector of an activity, the class
 * (traditional or not) of a product group, the zone of a country.
 */
const codeList = (dimension: string, key: string, name: string, parent: string): string => `
SELECT '${dimension}'::text AS dimension, entry.key AS code, ${name} AS name, ${parent} AS parent
FROM catalogue CROSS JOIN LATERAL jsonb_each(catalogue.${key}) AS entry(key, value)`;

export const tradeCodeSnapshot = `
CREATE MATERIALIZED VIEW read_models.trade_code AS
WITH catalogue AS MATERIALIZED (${CATALOGUE})
${[
  codeList('COUNTRY', 'countries', "entry.value ->> 'name'", "entry.value ->> 'zone'"),
  codeList('DEPARTMENT', 'departments', "entry.value #>> '{}'", 'NULL::text'),
  codeList('CHAPTER', 'chapters', "entry.value ->> 'name'", "entry.value ->> 'section'"),
  codeList('SECTION', 'sections', "entry.value #>> '{}'", 'NULL::text'),
  codeList('ACTIVITY', 'activities', "entry.value ->> 'name'", "entry.value ->> 'group'"),
  codeList('TRADITIONAL', 'traditional', "entry.value ->> 'name'", "entry.value ->> 'group'"),
  codeList('USE', 'uses', "entry.value #>> '{}'", 'NULL::text'),
  codeList('GCE', 'gce', "entry.value #>> '{}'", 'NULL::text'),
  codeList('CUCI', 'cuci', "entry.value #>> '{}'", 'NULL::text'),
  codeList('CIIU', 'ciiu', "entry.value #>> '{}'", 'NULL::text'),
].join('\nUNION ALL')}
WITH NO DATA;
`;

export const tradeIndexes = `
CREATE UNIQUE INDEX IF NOT EXISTS ux_trade_flow_row
  ON read_models.trade_flow (raw_observation_id, position);
CREATE INDEX IF NOT EXISTS ix_trade_flow_grain_year
  ON read_models.trade_flow (grain, year, month);
CREATE INDEX IF NOT EXISTS ix_trade_flow_grain_nandina
  ON read_models.trade_flow (grain, nandina text_pattern_ops);
CREATE INDEX IF NOT EXISTS ix_trade_flow_grain_country
  ON read_models.trade_flow (grain, country);
CREATE UNIQUE INDEX IF NOT EXISTS ux_trade_product_nandina
  ON read_models.trade_product (nandina);
CREATE UNIQUE INDEX IF NOT EXISTS ux_trade_code_dimension_code
  ON read_models.trade_code (dimension, code);
CREATE INDEX IF NOT EXISTS ix_raw_observation_trade_record
  ON intelligence.raw_observation ((payload_json ->> 'dataCategory'))
  WHERE payload_json ->> 'dataCategory' IN ('TRADE_RECORD', 'TRADE_CATALOGUE');
`;

export const tradeGrants = `
DO $$
DECLARE
  role_name text;
  view_name text;
BEGIN
  FOREACH role_name IN ARRAY ARRAY['backend_reader', 'backup_operator'] LOOP
    IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = role_name) THEN
      FOREACH view_name IN ARRAY ARRAY['trade_flow', 'trade_product', 'trade_code'] LOOP
        EXECUTE format('GRANT SELECT ON read_models.%I TO %I', view_name, role_name);
      END LOOP;
    END IF;
  END LOOP;
END;
$$;
`;
