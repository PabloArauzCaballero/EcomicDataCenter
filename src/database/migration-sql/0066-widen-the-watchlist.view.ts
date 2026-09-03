import { watchlist } from './0066-widen-the-watchlist.vocabulary';

/**
 * The mention model and its monthly reading, exactly as migration 0066 wrote
 * them.
 *
 * A snapshot, never edited: a later change to how the archive is read by word
 * is a later migration with its own copy.
 */

/**
 * Which watched subject each note names.
 *
 * Replaced in place rather than dropped, because the materialised copy that
 * migration 0053 created hangs off it and a drop would take the report down
 * until the next refresh. The column list is therefore fixed: same names, same
 * order, same types as the view this replaces.
 *
 * Two changes to how a word is found. The text is accent-stripped before
 * matching, so one pattern covers `diésel` and `diesel` instead of two. And the
 * match is anchored to the start of a word with `\\m` rather than floated
 * anywhere inside it, which is what stops `oro` from matching *ahorro* — the
 * failure migration 0056 found in the subject vocabulary and that this list
 * inherited.
 */
export const termView = `
CREATE OR REPLACE VIEW read_models.press_term_mention AS
WITH vocabulary(term, label, family, pattern) AS (
  VALUES
${watchlist}
),
-- Read from the stored copy of the archive, not from the view that builds it.
-- press_article reassembles every note from its evidence with a lateral join
-- per row; matching two hundred subjects against it made this view take over
-- ten minutes. The snapshot holds the same rows, already assembled, and the
-- load refreshes it first — so this reads what that refresh just wrote.
--
-- Materialised as a CTE so the accent-stripping runs once per note instead of
-- once per (note, subject) pair, which at two hundred subjects is the
-- difference between thirty-eight thousand calls and seven million.
article AS MATERIALIZED (
  SELECT
    fact_claim_id,
    event_date,
    outlet,
    topic,
    tone,
    region,
    translate(
      lower(coalesce(headline, '') || ' ' || coalesce(summary, '')),
      'áéíóúüñ',
      'aeiouun'
    ) AS searchable
  FROM read_models.press_article_snapshot
  WHERE status = 'PUBLISHED' AND NOT superseded
)
SELECT
  vocabulary.term,
  vocabulary.label,
  vocabulary.family,
  article.fact_claim_id,
  article.event_date,
  article.outlet,
  article.topic,
  article.tone,
  article.region
FROM article
JOIN vocabulary ON article.searchable ~ ANY (vocabulary.pattern);
`;

/**
 * The same corpus read as a calendar.
 *
 * Every panel built on the mention model until now answered «how much» and none
 * answered «when», which for coverage is most of the question: a subject that
 * holds four hundred notes spread over six years and one that holds four
 * hundred in a single month are not the same event, and a total cannot tell
 * them apart.
 *
 * The month is the grain because the corpus is uneven by day — outlets publish
 * in bursts, and a daily series of a small subject is mostly zeros with spikes
 * that read as noise. Tone is carried across as counts rather than a dominant
 * label: a month where a subject was covered with equal alarm and improvement
 * is a real month, and naming one winner would erase it.
 *
 * Read from the materialised copy, like every other press panel: it is the
 * same rows, indexed, and refreshed by the same load.
 */
export const termMonthView = `
CREATE VIEW read_models.press_term_month AS
SELECT
  term,
  max(label)                                             AS label,
  max(family)                                            AS family,
  to_char(date_trunc('month', event_date), 'YYYY-MM')    AS month,
  count(*)                                               AS mentions,
  count(DISTINCT outlet)                                 AS outlets,
  count(DISTINCT topic)                                  AS topics,
  count(*) FILTER (WHERE tone = 'ALARMA')                AS alarma,
  count(*) FILTER (WHERE tone = 'DETERIORO')             AS deterioro,
  count(*) FILTER (WHERE tone = 'CONFLICTO')             AS conflicto,
  count(*) FILTER (WHERE tone = 'INCERTIDUMBRE')         AS incertidumbre,
  count(*) FILTER (WHERE tone = 'MEJORA')                AS mejora,
  count(*) FILTER (WHERE tone = 'MEDIDA')                AS medida,
  count(*) FILTER (WHERE tone IN ('NEUTRO', 'DECLARACION')) AS neutro,
  -- The share that reads badly, kept as a column so a panel never has to add
  -- the four negative tones itself and get a different answer than the next one.
  round(
    100.0 * count(*) FILTER (WHERE tone IN ('ALARMA', 'DETERIORO', 'CONFLICTO', 'INCERTIDUMBRE'))
      / nullif(count(*), 0), 1)                          AS adverse_share
FROM read_models.press_term_mention_snapshot
WHERE event_date IS NOT NULL
GROUP BY term, to_char(date_trunc('month', event_date), 'YYYY-MM');
`;
