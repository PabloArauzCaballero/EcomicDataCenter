import type { MigrationContext } from '../migration.types';

/**
 * Extends the sector classification to the full eighty-six annual series.
 *
 * The observatory previously carried forty-four indicators and no view of the
 * country's debt position beyond a single total. Forty-two more are now
 * published — twelve of them describing external debt by creditor, maturity and
 * service burden — so the classification grows a DEUDA sector to hold them.
 * Filing them under FISCAL would have buried the debt question inside the
 * budget one; a reader asking how much Bolivia owes and to whom is asking a
 * different question than how much the state spends.
 *
 * The two indicators that shipped under FISCAL in 0036 move to DEUDA with it,
 * so the sector reads as one set rather than as an old half and a new half.
 *
 * Same shape as the model it replaces: the sector is derived from the indicator
 * code, no observation is rewritten, and the view is dropped before it is
 * recreated so re-running the migration converges.
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
