import {
  businessFormCase,
  goodsClassCase,
  marketRegimeCase,
  measureKindCase,
  populationScopeCase,
  settlementCase,
  territoryCase,
  tradeSideCase,
} from './0065-read-trade-by-form.lexicon';

/**
 * The commerce model exactly as migration 0065 wrote it; its three panels are
 * beside it in the panels file.
 *
 * A snapshot, never edited: a later change to how trade is read is a later
 * migration with its own copy, so rolling forward and back always replays the
 * definition that step actually applied.
 */

export const dropTradeViews = `
DROP VIEW IF EXISTS read_models.informal_trade_gap;
DROP VIEW IF EXISTS read_models.informal_trade_coverage;
DROP VIEW IF EXISTS read_models.informal_trade_channel_mix;
DROP VIEW IF EXISTS read_models.social_commerce;
`;

/** Every commerce reading, filed by the way the trade is actually done. */
export const commerceView = `
CREATE VIEW read_models.social_commerce AS
WITH commerce AS (
  SELECT
    fact_claim_id,
    event_date,
    reference_period,
    platform,
    metric,
    label,
    value,
    unit,
    publisher,
    publisher_domain,
    publication,
    method,
    evidence_grade,
    reading_url,
    official_counterpart,
    statement,
    status,
    superseded
  FROM read_models.social_reading
  WHERE subject = 'COMMERCE'
),
normalized AS (
  SELECT
    commerce.*,
    translate(
      lower(coalesce(label, '')),
      'áéíóúüñÁÉÍÓÚÜÑ',
      'aeiouunaeiouun'
    ) AS named
  FROM commerce
),
filed AS (
  SELECT
    normalized.*,
${businessFormCase} AS business_form,
${tradeSideCase} AS trade_side,
${settlementCase} AS settlement_means,
${goodsClassCase} AS goods_class,
${measureKindCase} AS measure_kind,
${populationScopeCase} AS population_scope,
${territoryCase} AS territory
  FROM normalized
)
SELECT
  fact_claim_id,
  event_date,
  reference_period,
  platform,
  metric,
  label,
  value,
  unit,
  business_form,
${marketRegimeCase} AS market_regime,
  trade_side,
  settlement_means,
  goods_class,
  measure_kind,
  population_scope,
  territory,
  official_counterpart,
  publisher,
  publisher_domain,
  publication,
  method,
  evidence_grade,
  reading_url,
  statement,
  status,
  superseded
FROM filed;
`;
