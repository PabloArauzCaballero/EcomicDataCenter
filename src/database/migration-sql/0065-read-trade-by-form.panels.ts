/**
 * The three panels migration 0065 builds on top of the commerce model.
 *
 * Kept apart from the model they read for the reason they exist: the model
 * files a reading, the panels answer a question about many of them, and the
 * questions are what change. A snapshot, never edited: a later change to how
 * trade is summarised is a later migration with its own copy.
 */

/**
 * How many channels a household actually buys through, and how much of that is
 * informal.
 *
 * `penetration_sum` exceeds 100 and is supposed to: 71% of households buy
 * clothing in popular fairs, 37% in traditional markets and 24% in malls, and
 * the same household is counted in all three. These are multi-response
 * penetrations, never market shares. Reading the sum as a share would be the
 * single most likely misuse of this model, so the quotient is published under a
 * name that says what it is — `channels_per_household`, 1.55 for clothing in
 * 2025 — and the raw sum is left visible beside it.
 *
 * `informal_share_of_visits` divides informal penetration by that same sum. It
 * answers the question the panel exists for: of every hundred shopping
 * decisions a household makes for this basket, how many happen where nothing is
 * invoiced. It is a share of visits, not of money: a mall ticket and a fair
 * ticket are not the same size, and this model has no reading of either.
 *
 * None of those three numbers survives unless the group holds one reading per
 * form of trade, which `one_reading_per_form` states. The social commerce study
 * is why: it asks six different questions — who closes on WhatsApp, who arrives
 * through Marketplace, who sees an advert — and every answer files under
 * `COMERCIO_SOCIAL`. Added up they reach 194 and mean nothing, because they are
 * six readings of one channel and not six channels. The row is still published,
 * with its counts, so that the group is visible; the quotients are null,
 * because there is no channel mix there to compute.
 */
export const channelMixView = `
CREATE VIEW read_models.informal_trade_channel_mix AS
WITH penetration AS (
  SELECT
    goods_class,
    territory,
    reference_period,
    business_form,
    market_regime,
    value,
    evidence_grade,
    publisher
  FROM read_models.social_commerce
  WHERE trade_side = 'DEMANDA'
    AND measure_kind = 'PENETRACION'
    AND population_scope = 'TOTAL'
    AND business_form <> 'NINGUNA'
    AND status = 'PUBLISHED'
    AND NOT superseded
)
SELECT
  goods_class,
  territory,
  reference_period,
  count(*)                                        AS readings,
  count(DISTINCT business_form)                   AS forms_read,
  count(DISTINCT publisher)                       AS compilers,
  (count(*) = count(DISTINCT business_form))      AS one_reading_per_form,
  CASE WHEN count(*) = count(DISTINCT business_form)
    THEN sum(value) END                           AS penetration_sum,
  CASE WHEN count(*) = count(DISTINCT business_form)
    THEN round(sum(value) / 100, 2) END           AS channels_per_household,
  CASE WHEN count(*) = count(DISTINCT business_form)
    THEN coalesce(sum(value) FILTER (WHERE market_regime = 'INFORMAL'), 0) END
                                                  AS informal_penetration,
  CASE WHEN count(*) = count(DISTINCT business_form)
    THEN coalesce(sum(value) FILTER (WHERE market_regime = 'MIXTO'), 0) END
                                                  AS mixed_penetration,
  CASE WHEN count(*) = count(DISTINCT business_form)
    THEN coalesce(sum(value) FILTER (WHERE market_regime = 'FORMAL'), 0) END
                                                  AS formal_penetration,
  CASE WHEN count(*) = count(DISTINCT business_form)
    THEN round(
      100 * coalesce(sum(value) FILTER (WHERE market_regime = 'INFORMAL'), 0)
        / nullif(sum(value), 0), 1) END           AS informal_share_of_visits,
  count(*) FILTER (WHERE evidence_grade = 'HIGH') AS high_grade_readings,
  array_agg(DISTINCT business_form ORDER BY business_form) AS forms
FROM penetration
GROUP BY goods_class, territory, reference_period;
`;

/**
 * What the register can and cannot say about each form of doing business.
 *
 * The vocabulary is written out as rows rather than inferred from the readings,
 * which is the entire point: a form nobody has published a figure for produces
 * a row saying so instead of vanishing. The observatory's coverage of informal
 * trade is uneven by nature — household panels measure clothing channels every
 * year and nobody at all measures street vending — and a panel that only shows
 * what exists would present that silence as absence.
 */
export const coverageView = `
CREATE VIEW read_models.informal_trade_coverage AS
WITH vocabulary (business_form, market_regime) AS (
  VALUES
    ('FERIA_POPULAR', 'INFORMAL'),
    ('MERCADO_TRADICIONAL', 'INFORMAL'),
    ('TIENDA_BARRIO', 'INFORMAL'),
    ('CUENTA_PROPIA', 'INFORMAL'),
    ('CONTRABANDO', 'INFORMAL'),
    ('COMERCIO_SOCIAL', 'MIXTO'),
    ('COMERCIO_ELECTRONICO', 'MIXTO'),
    ('VENTA_CATALOGO', 'MIXTO'),
    ('SUPERMERCADO', 'FORMAL'),
    ('CENTRO_COMERCIAL', 'FORMAL'),
    ('BOUTIQUE', 'FORMAL')
)
SELECT
  vocabulary.business_form,
  vocabulary.market_regime,
  count(reading.fact_claim_id)                                       AS readings,
  count(reading.fact_claim_id) FILTER (WHERE reading.evidence_grade = 'HIGH')   AS high_grade,
  count(reading.fact_claim_id) FILTER (WHERE reading.evidence_grade = 'LOW')    AS low_grade,
  count(DISTINCT reading.publisher)                                  AS compilers,
  count(DISTINCT reading.territory)                                  AS territories,
  count(DISTINCT reading.settlement_means)
    FILTER (WHERE reading.settlement_means <> 'NINGUNO')              AS settlements_read,
  max(reading.reference_period)                                      AS latest_period,
  (count(reading.fact_claim_id) = 0)                                 AS unread
FROM vocabulary
LEFT JOIN read_models.social_commerce AS reading
  ON reading.business_form = vocabulary.business_form
 AND reading.status = 'PUBLISHED'
 AND NOT reading.superseded
GROUP BY vocabulary.business_form, vocabulary.market_regime;
`;

/**
 * The distance between what the register reads and what the country measures.
 *
 * ADR 0022 said the level of a social reading is never the indicator: the gap
 * against the measured series is. This is that operation, for trade, and it is
 * deliberately narrow. Two pairings and no more, because a pairing that is not
 * commensurable is worse than no pairing at all: the first version of this view
 * mapped every reading whose subject read as consumption to household
 * consumption over GDP, and cheerfully reported that 71% of households buying
 * clothing in fairs sits 47 points below the national consumption ratio, which
 * is not a finding but a category error printed as a number.
 *
 * What survives compares like with like:
 *
 * - A census share of own-account workers against the modelled series of
 *   vulnerable employment. Both count the same people in the same unit, and
 *   they still disagree by eleven points because one counts own-account workers
 *   and the other adds unpaid family workers. That disagreement is the reading.
 * - A rate against a rate: a basket that lost volume against the year's
 *   measured inflation.
 *
 * The column is `distance_points` and never `error`. Two houses measured one
 * economy with different methods; a reader who takes the distance as one of
 * them being wrong has misread both.
 *
 * `PAGOS` has no counterpart here on purpose. The measured payment series lives
 * in the Central Bank's payment-system surveillance report and has not been
 * loaded into the indicator register yet; mapping it to bank branches or ATMs
 * to fill the column would invent a comparison nobody made.
 */
export const gapView = `
CREATE VIEW read_models.informal_trade_gap AS
WITH reading AS (
  SELECT
    commerce.*,
    CASE
      WHEN commerce.business_form = 'CUENTA_PROPIA'
       AND commerce.trade_side = 'OFERTA'
       AND commerce.measure_kind = 'PENETRACION'
        THEN 'VULNERABLE_EMPLOYMENT_PCT'
      WHEN commerce.official_counterpart = 'PRECIOS'
       AND commerce.measure_kind = 'VARIACION'
        THEN 'CPI_INFLATION_ANNUAL_PCT'
    END AS indicator_code
  FROM read_models.social_commerce AS commerce
  WHERE commerce.unit = 'PERCENT'
    AND commerce.status = 'PUBLISHED'
    AND NOT commerce.superseded
)
SELECT
  reading.fact_claim_id,
  reading.label,
  reading.value            AS social_value,
  reading.reference_period,
  reading.business_form,
  reading.market_regime,
  reading.trade_side,
  reading.territory,
  reading.publisher        AS social_publisher,
  reading.evidence_grade,
  reading.indicator_code,
  measured.value           AS measured_value,
  measured.publisher       AS measured_publisher,
  measured.period          AS measured_period,
  round(reading.value - measured.value, 2) AS distance_points
FROM reading
LEFT JOIN LATERAL (
  SELECT series.value, series.publisher, series.period
  FROM read_models.economic_indicator_reading AS series
  WHERE series.indicator_code = reading.indicator_code
    AND series.period = left(reading.reference_period, 4)
    AND series.frequency = 'ANNUAL'
    AND series.status = 'PUBLISHED'
    AND NOT series.superseded
  ORDER BY series.event_date DESC
  LIMIT 1
) AS measured ON true
WHERE reading.indicator_code IS NOT NULL;
`;
