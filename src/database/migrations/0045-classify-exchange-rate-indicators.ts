import type { MigrationContext } from '../migration.types';

/**
 * Adds the exchange-rate indicators to the sector classification.
 *
 * The venue that serves the daily parallel rate has nothing before July 2024,
 * so the years before that come from the multilateral compiler at annual
 * frequency: the official rate since 1983, the real effective rate since 1980,
 * and the purchasing-power factor since 1990. A reader asking what the currency
 * did in 2020 now has an answer instead of a blank.
 *
 * They get their own CAMBIARIO sector rather than joining MONETARIO. The
 * question "what is a dollar worth" is not the question "what is credit doing",
 * and in this country it is the first one anybody asks.
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
    WHEN 'AGRICULTURAL_EXPORTS_PCT' THEN 'EXTERNO'
    WHEN 'AGRICULTURE_GROWTH_PCT' THEN 'SECTORIAL'
    WHEN 'AGRICULTURE_VALUE_ADDED_PCT_GDP' THEN 'SECTORIAL'
    WHEN 'BANK_CAPITAL_TO_ASSETS_PCT' THEN 'MONETARIO'
    WHEN 'BANK_LIQUID_RESERVES_PCT' THEN 'MONETARIO'
    WHEN 'BOP_EXPORTS_USD' THEN 'EXTERNO'
    WHEN 'BOP_IMPORTS_USD' THEN 'EXTERNO'
    WHEN 'BROAD_MONEY_GROWTH_PCT' THEN 'MONETARIO'
    WHEN 'BROAD_MONEY_PCT_GDP' THEN 'MONETARIO'
    WHEN 'CPI_INDEX' THEN 'PRECIOS'
    WHEN 'OFFICIAL_EXCHANGE_RATE_BOB_USD' THEN 'CAMBIARIO'
    WHEN 'PPP_CONVERSION_FACTOR' THEN 'CAMBIARIO'
    WHEN 'REAL_EFFECTIVE_EXCHANGE_RATE' THEN 'CAMBIARIO'
    WHEN 'CPI_INFLATION_ANNUAL_PCT' THEN 'PRECIOS'
    WHEN 'CURRENT_ACCOUNT_PCT_GDP' THEN 'EXTERNO'
    WHEN 'CURRENT_ACCOUNT_USD' THEN 'EXTERNO'
    WHEN 'DEBT_SERVICE_PCT_EXPORTS' THEN 'DEUDA'
    WHEN 'DEBT_TO_IBRD_USD' THEN 'DEUDA'
    WHEN 'DEBT_TO_IDA_USD' THEN 'DEUDA'
    WHEN 'DEBT_TO_WORLD_BANK_USD' THEN 'DEUDA'
    WHEN 'DEPOSIT_RATE_PCT' THEN 'MONETARIO'
    WHEN 'EDUCATION_SPENDING_PCT_GDP' THEN 'SOCIAL'
    WHEN 'EMPLOYMENT_AGRICULTURE_PCT' THEN 'SOCIAL'
    WHEN 'EMPLOYMENT_INDUSTRY_PCT' THEN 'SOCIAL'
    WHEN 'EMPLOYMENT_SERVICES_PCT' THEN 'SOCIAL'
    WHEN 'ENERGY_USE_PER_CAPITA' THEN 'SECTORIAL'
    WHEN 'EXPORTS_GOODS_SERVICES_USD' THEN 'EXTERNO'
    WHEN 'EXPORTS_PCT_GDP' THEN 'EXTERNO'
    WHEN 'EXTERNAL_DEBT_PCT_GNI' THEN 'DEUDA'
    WHEN 'EXTERNAL_DEBT_USD' THEN 'DEUDA'
    WHEN 'EXTREME_POVERTY_PCT' THEN 'SOCIAL'
    WHEN 'FDI_NET_INFLOWS_PCT_GDP' THEN 'EXTERNO'
    WHEN 'FDI_NET_INFLOWS_USD' THEN 'EXTERNO'
    WHEN 'FOOD_PRODUCTION_INDEX' THEN 'SECTORIAL'
    WHEN 'FOREST_RENTS_PCT_GDP' THEN 'RECURSOS'
    WHEN 'FUEL_EXPORTS_PCT' THEN 'EXTERNO'
    WHEN 'GDP_CURRENT_USD' THEN 'ACTIVIDAD'
    WHEN 'GDP_DEFLATOR_PCT' THEN 'PRECIOS'
    WHEN 'GDP_GROWTH_ANNUAL_PCT' THEN 'ACTIVIDAD'
    WHEN 'GDP_PER_CAPITA_GROWTH_PCT' THEN 'ACTIVIDAD'
    WHEN 'GDP_PER_CAPITA_USD' THEN 'ACTIVIDAD'
    WHEN 'GINI_INDEX' THEN 'SOCIAL'
    WHEN 'GOVERNMENT_CONSUMPTION_PCT_GDP' THEN 'ACTIVIDAD'
    WHEN 'GROSS_CAPITAL_FORMATION_PCT_GDP' THEN 'ACTIVIDAD'
    WHEN 'GROSS_NATIONAL_INCOME_USD' THEN 'ACTIVIDAD'
    WHEN 'GROSS_NATIONAL_SAVINGS_PCT_GDP' THEN 'ACTIVIDAD'
    WHEN 'HEALTH_SPENDING_PCT_GDP' THEN 'SOCIAL'
    WHEN 'HIGH_TECH_EXPORTS_PCT' THEN 'ACTIVIDAD'
    WHEN 'HOUSEHOLD_CONSUMPTION_PCT_GDP' THEN 'ACTIVIDAD'
    WHEN 'IMPORTS_GOODS_SERVICES_USD' THEN 'EXTERNO'
    WHEN 'IMPORTS_PCT_GDP' THEN 'EXTERNO'
    WHEN 'INDUSTRY_GROWTH_PCT' THEN 'SECTORIAL'
    WHEN 'INDUSTRY_VALUE_ADDED_PCT_GDP' THEN 'SECTORIAL'
    WHEN 'INTEREST_RATE_SPREAD_PCT' THEN 'MONETARIO'
    WHEN 'INTERNATIONAL_RESERVES_USD' THEN 'EXTERNO'
    WHEN 'LABOUR_PARTICIPATION_PCT' THEN 'SOCIAL'
    WHEN 'LENDING_RATE_PCT' THEN 'MONETARIO'
    WHEN 'LIFE_EXPECTANCY_YEARS' THEN 'SOCIAL'
    WHEN 'LONG_TERM_EXTERNAL_DEBT_USD' THEN 'DEUDA'
    WHEN 'MANUFACTURING_VALUE_ADDED_PCT_GDP' THEN 'SECTORIAL'
    WHEN 'MERCHANDISE_EXPORTS_USD' THEN 'EXTERNO'
    WHEN 'MERCHANDISE_IMPORTS_USD' THEN 'EXTERNO'
    WHEN 'MINERAL_RENTS_PCT_GDP' THEN 'RECURSOS'
    WHEN 'MOBILE_SUBSCRIPTIONS' THEN 'SECTORIAL'
    WHEN 'NATURAL_GAS_RENTS_PCT_GDP' THEN 'RECURSOS'
    WHEN 'NONPERFORMING_LOANS_PCT' THEN 'MONETARIO'
    WHEN 'OIL_RENTS_PCT_GDP' THEN 'RECURSOS'
    WHEN 'ORES_METALS_EXPORTS_PCT' THEN 'EXTERNO'
    WHEN 'POPULATION_TOTAL' THEN 'SOCIAL'
    WHEN 'PRIVATE_CREDIT_PCT_GDP' THEN 'MONETARIO'
    WHEN 'PRIVATE_NONGUARANTEED_DEBT_USD' THEN 'DEUDA'
    WHEN 'PUBLIC_DEBT_SERVICE_PCT_EXPORTS' THEN 'DEUDA'
    WHEN 'PUBLIC_GUARANTEED_DEBT_USD' THEN 'DEUDA'
    WHEN 'REAL_INTEREST_RATE_PCT' THEN 'MONETARIO'
    WHEN 'REMITTANCES_PCT_GDP' THEN 'EXTERNO'
    WHEN 'REMITTANCES_USD' THEN 'EXTERNO'
    WHEN 'RESERVES_IN_IMPORT_MONTHS' THEN 'EXTERNO'
    WHEN 'RESERVES_TO_EXTERNAL_DEBT_PCT' THEN 'DEUDA'
    WHEN 'SERVICES_GROWTH_PCT' THEN 'SECTORIAL'
    WHEN 'SERVICES_VALUE_ADDED_PCT_GDP' THEN 'SECTORIAL'
    WHEN 'SHORT_TERM_EXTERNAL_DEBT_USD' THEN 'DEUDA'
    WHEN 'SOVEREIGN_BOND_NET_FLOWS_USD' THEN 'DEUDA'
    WHEN 'TERMS_OF_TRADE_INDEX' THEN 'EXTERNO'
    WHEN 'TOTAL_DEBT_SERVICE_USD' THEN 'DEUDA'
    WHEN 'TOTAL_NATURAL_RESOURCE_RENTS_PCT_GDP' THEN 'RECURSOS'
    WHEN 'TRADE_BALANCE_PCT_GDP' THEN 'ACTIVIDAD'
    WHEN 'UNEMPLOYMENT_PCT' THEN 'SOCIAL'
    WHEN 'URBAN_POPULATION_PCT' THEN 'SOCIAL'
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
