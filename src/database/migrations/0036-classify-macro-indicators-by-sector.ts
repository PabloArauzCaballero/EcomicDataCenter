import type { MigrationContext } from '../migration.types';

/**
 * Files every annual indicator under the sector an analyst would look for it in.
 *
 * The observatory now carries forty-four macroeconomic series, which is more
 * than anyone reads at once. Without a sector they are one undifferentiated
 * list; with it, a reader asking about the external position or about the
 * resource sector gets exactly those and nothing else.
 *
 * The classification lives here rather than in each observation because it is a
 * property of the indicator, not of the reading: the 2001 figure for mineral
 * rents does not belong to a different sector than the 2021 one. Keeping it out
 * of the payload also means adding it changed no digest and duplicated no row.
 *
 * Idempotent like the models before it: dropped before being recreated.
 */

const dropView = `DROP VIEW IF EXISTS read_models.macro_indicator_annual;`;

const annualView = `
CREATE VIEW read_models.macro_indicator_annual AS
WITH published AS (
  SELECT
    indicator_code,
    max(indicator_name)   AS indicator_name,
    period,
    unit,
    max(publisher)        AS publisher,
    max(source_url)       AS source_url,
    max(evidence_sha256)  AS evidence_sha256,
    max(event_date)       AS period_end,
    avg(value)            AS value
  FROM read_models.economic_indicator_reading
  WHERE status = 'PUBLISHED'
    AND NOT superseded
    AND frequency = 'ANNUAL'
    AND period IS NOT NULL
  GROUP BY indicator_code, period, unit
),
classified AS (
  SELECT
    published.*,
    CASE indicator_code
    WHEN 'AGRICULTURE_GROWTH_PCT' THEN 'SECTORIAL'
    WHEN 'AGRICULTURE_VALUE_ADDED_PCT_GDP' THEN 'SECTORIAL'
    WHEN 'BROAD_MONEY_PCT_GDP' THEN 'MONETARIO'
    WHEN 'CPI_INDEX' THEN 'PRECIOS'
    WHEN 'CPI_INFLATION_ANNUAL_PCT' THEN 'PRECIOS'
    WHEN 'CURRENT_ACCOUNT_PCT_GDP' THEN 'EXTERNO'
    WHEN 'DEBT_SERVICE_PCT_EXPORTS' THEN 'FISCAL'
    WHEN 'DEPOSIT_RATE_PCT' THEN 'MONETARIO'
    WHEN 'EXPORTS_GOODS_SERVICES_USD' THEN 'EXTERNO'
    WHEN 'EXPORTS_PCT_GDP' THEN 'EXTERNO'
    WHEN 'EXTERNAL_DEBT_USD' THEN 'FISCAL'
    WHEN 'FDI_NET_INFLOWS_PCT_GDP' THEN 'EXTERNO'
    WHEN 'FOREST_RENTS_PCT_GDP' THEN 'RECURSOS'
    WHEN 'GDP_CURRENT_USD' THEN 'ACTIVIDAD'
    WHEN 'GDP_DEFLATOR_PCT' THEN 'PRECIOS'
    WHEN 'GDP_GROWTH_ANNUAL_PCT' THEN 'ACTIVIDAD'
    WHEN 'GDP_PER_CAPITA_GROWTH_PCT' THEN 'ACTIVIDAD'
    WHEN 'GDP_PER_CAPITA_USD' THEN 'ACTIVIDAD'
    WHEN 'GINI_INDEX' THEN 'SOCIAL'
    WHEN 'GOVERNMENT_CONSUMPTION_PCT_GDP' THEN 'ACTIVIDAD'
    WHEN 'GROSS_CAPITAL_FORMATION_PCT_GDP' THEN 'ACTIVIDAD'
    WHEN 'HOUSEHOLD_CONSUMPTION_PCT_GDP' THEN 'ACTIVIDAD'
    WHEN 'IMPORTS_GOODS_SERVICES_USD' THEN 'EXTERNO'
    WHEN 'IMPORTS_PCT_GDP' THEN 'EXTERNO'
    WHEN 'INDUSTRY_GROWTH_PCT' THEN 'SECTORIAL'
    WHEN 'INDUSTRY_VALUE_ADDED_PCT_GDP' THEN 'SECTORIAL'
    WHEN 'INTEREST_RATE_SPREAD_PCT' THEN 'MONETARIO'
    WHEN 'INTERNATIONAL_RESERVES_USD' THEN 'EXTERNO'
    WHEN 'LABOUR_PARTICIPATION_PCT' THEN 'SOCIAL'
    WHEN 'LENDING_RATE_PCT' THEN 'MONETARIO'
    WHEN 'MANUFACTURING_VALUE_ADDED_PCT_GDP' THEN 'SECTORIAL'
    WHEN 'MINERAL_RENTS_PCT_GDP' THEN 'RECURSOS'
    WHEN 'NATURAL_GAS_RENTS_PCT_GDP' THEN 'RECURSOS'
    WHEN 'OIL_RENTS_PCT_GDP' THEN 'RECURSOS'
    WHEN 'POPULATION_TOTAL' THEN 'SOCIAL'
    WHEN 'PRIVATE_CREDIT_PCT_GDP' THEN 'MONETARIO'
    WHEN 'REMITTANCES_PCT_GDP' THEN 'EXTERNO'
    WHEN 'RESERVES_IN_IMPORT_MONTHS' THEN 'EXTERNO'
    WHEN 'SERVICES_GROWTH_PCT' THEN 'SECTORIAL'
    WHEN 'SERVICES_VALUE_ADDED_PCT_GDP' THEN 'SECTORIAL'
    WHEN 'TERMS_OF_TRADE_INDEX' THEN 'EXTERNO'
    WHEN 'TOTAL_NATURAL_RESOURCE_RENTS_PCT_GDP' THEN 'RECURSOS'
    WHEN 'UNEMPLOYMENT_PCT' THEN 'SOCIAL'
    WHEN 'YOUTH_UNEMPLOYMENT_PCT' THEN 'SOCIAL'
      ELSE 'OTROS'
    END AS sector
  FROM published
)
SELECT
  classified.*,
  lag(value) OVER series                AS previous_value,
  value - lag(value) OVER series        AS change_absolute,
  round(
    (value - lag(value) OVER series) / NULLIF(abs(lag(value) OVER series), 0) * 100,
    4
  )                                     AS change_percent
FROM classified
WINDOW series AS (PARTITION BY indicator_code ORDER BY period);
`;

const grants = `
DO $$
DECLARE
  role_name text;
BEGIN
  FOREACH role_name IN ARRAY ARRAY['backend_reader', 'backup_operator'] LOOP
    IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = role_name) THEN
      EXECUTE format('GRANT SELECT ON read_models.macro_indicator_annual TO %I', role_name);
    END IF;
  END LOOP;
END;
$$;
`;

export async function up({ context }: MigrationContext): Promise<void> {
  await context.sequelize.query(dropView);
  await context.sequelize.query(annualView);
  await context.sequelize.query(grants);
}

export async function down({ context }: MigrationContext): Promise<void> {
  await context.sequelize.query(dropView);
}
