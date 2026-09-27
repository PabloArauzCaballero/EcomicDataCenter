/**
 * The checks the observatory runs on its own collection.
 *
 * Every one of them answers with a numerator, a denominator and a count of what
 * it could not judge, because a rule that answers only «passed» is a rule whose
 * result cannot be argued with. The population is stated in the rule, not
 * inferred from whatever rows happened to come back.
 *
 * Two of them deserve their names read carefully. `CLAIM_TEXTUAL_SUPPORT`
 * checks that a figure in an assertion also appears in the excerpt it cites —
 * that is textual support, not truth. A number can be quoted accurately from a
 * source that was wrong, and this rule cannot tell. `CLAIM_UNIQUE_CONTENT`
 * counts distinct content, not correctness: two outlets reporting the same
 * event is not duplication.
 */
export interface CollectionRule {
  readonly code: string;
  readonly version: string;
  readonly name: string;
  readonly dimensionCode: string;
  readonly severity: 'INFO' | 'WARNING' | 'ERROR' | 'CRITICAL';
  readonly targetEntityType: string;
  readonly scope: string;
  /** Returns exactly one row with numerator, denominator and not_evaluated. */
  readonly sql: string;
}

/**
 * Evidence on the claims where the schema does not already guarantee it.
 *
 * A published claim without evidence cannot exist: the constraint trigger
 * `trg_claim_requires_evidence` refuses it. Counting those rows here would add
 * a population that can only pass, and a rule diluted by guaranteed successes
 * reports a comfortable share while the claims that actually lack evidence —
 * the pending ones, the ones somebody is about to approve — disappear into it.
 *
 * So the scope is exactly the statuses the database leaves open.
 */
const EVIDENCE_PRESENT = `
SELECT
  COUNT(*) FILTER (
    WHERE EXISTS (
      SELECT 1 FROM intelligence.claim_evidence evidence
       WHERE evidence.fact_claim_id = claim.fact_claim_id
    )
  ) AS numerator,
  COUNT(*) AS denominator,
  0 AS not_evaluated
FROM intelligence.fact_claim claim
WHERE claim.status IN ('DRAFT', 'PENDING_REVIEW')
`;

/**
 * Where the cited artifact came from, which the digest alone does not say.
 *
 * `sha256` is `NOT NULL` in the schema, so checking it would be a rule that
 * cannot fail — and a rule that cannot fail is worse than no rule, because it
 * adds a passing row to every summary. `original_uri` is the column that
 * actually records provenance and is actually nullable.
 */
const EVIDENCE_PROVENANCE = `
SELECT
  COUNT(*) FILTER (WHERE artifact.original_uri IS NOT NULL) AS numerator,
  COUNT(*) AS denominator,
  0 AS not_evaluated
FROM intelligence.claim_evidence evidence
JOIN provenance.source_artifact artifact
  ON artifact.source_artifact_id = evidence.source_artifact_id
`;

/**
 * A figure in the assertion that also appears in the excerpt that supports it.
 *
 * Claims with no figure at all are not evaluated rather than passed: a
 * narrative statement has nothing to match, and counting it as a success would
 * inflate the share with rows the rule never looked at.
 */
const TEXTUAL_SUPPORT = `
WITH candidate AS (
  SELECT
    claim.fact_claim_id,
    substring(claim.assertion from '[0-9]+[.,][0-9]+') AS figure
  FROM intelligence.fact_claim claim
  WHERE claim.status IN ('PUBLISHED', 'PENDING_REVIEW')
)
SELECT
  COUNT(*) FILTER (
    WHERE candidate.figure IS NOT NULL
      AND EXISTS (
        SELECT 1 FROM intelligence.claim_evidence evidence
         WHERE evidence.fact_claim_id = candidate.fact_claim_id
           AND position(
                 replace(candidate.figure, ',', '.') in replace(evidence.excerpt, ',', '.')
               ) > 0
      )
  ) AS numerator,
  COUNT(*) FILTER (WHERE candidate.figure IS NOT NULL) AS denominator,
  COUNT(*) FILTER (WHERE candidate.figure IS NULL) AS not_evaluated
FROM candidate
`;

const SOURCE_SCHEDULE = `
SELECT
  COUNT(*) FILTER (
    WHERE EXISTS (
      SELECT 1 FROM operations.source_expectation expectation
       WHERE expectation.source_id = source.source_id
    )
  ) AS numerator,
  COUNT(*) AS denominator,
  0 AS not_evaluated
FROM provenance.source source
WHERE source.is_active
`;

const EVENT_DATE_SANE = `
SELECT
  COUNT(*) FILTER (WHERE claim.event_date <= CURRENT_DATE) AS numerator,
  COUNT(*) FILTER (WHERE claim.event_date IS NOT NULL) AS denominator,
  COUNT(*) FILTER (WHERE claim.event_date IS NULL) AS not_evaluated
FROM intelligence.fact_claim claim
WHERE claim.status IN ('PUBLISHED', 'PENDING_REVIEW')
`;

const UNIQUE_CONTENT = `
WITH tally AS (
  SELECT claim.content_hash, COUNT(*) AS copies
    FROM intelligence.fact_claim claim
   WHERE claim.status IN ('PUBLISHED', 'PENDING_REVIEW')
   GROUP BY claim.content_hash
)
SELECT
  COALESCE(SUM(copies) FILTER (WHERE copies = 1), 0) AS numerator,
  COALESCE(SUM(copies), 0) AS denominator,
  0 AS not_evaluated
FROM tally
`;

const OBSERVATION_UNIT = `
SELECT
  COUNT(*) FILTER (WHERE measure.unit_measure_id IS NOT NULL) AS numerator,
  COUNT(*) AS denominator,
  0 AS not_evaluated
FROM statistics.observation_measure value
JOIN metadata.measure_definition measure
  ON measure.measure_definition_id = value.measure_definition_id
`;

export const COLLECTION_RULES: readonly CollectionRule[] = [
  {
    code: 'CLAIM_HAS_EVIDENCE',
    version: '1.0.0',
    name: 'Toda afirmación pendiente conserva evidencia antes de poder publicarse',
    dimensionCode: 'ACCURACY',
    severity: 'ERROR',
    targetEntityType: 'FACT_CLAIM',
    scope: 'claims:draft-and-pending',
    sql: EVIDENCE_PRESENT,
  },
  {
    code: 'EVIDENCE_HAS_PROVENANCE',
    version: '1.0.0',
    name: 'La evidencia cita un artefacto con origen declarado',
    dimensionCode: 'ACCURACY',
    severity: 'ERROR',
    targetEntityType: 'CLAIM_EVIDENCE',
    scope: 'evidence:all',
    sql: EVIDENCE_PROVENANCE,
  },
  {
    code: 'CLAIM_TEXTUAL_SUPPORT',
    version: '1.0.0',
    name: 'La cifra afirmada aparece en el texto citado (respaldo textual, no verdad)',
    dimensionCode: 'ACCURACY',
    severity: 'WARNING',
    targetEntityType: 'FACT_CLAIM',
    scope: 'claims:with-figure',
    sql: TEXTUAL_SUPPORT,
  },
  {
    code: 'SOURCE_HAS_SCHEDULE',
    version: '1.0.0',
    name: 'Toda fuente activa declara su calendario',
    dimensionCode: 'TIMELINESS',
    severity: 'WARNING',
    targetEntityType: 'SOURCE',
    scope: 'sources:active',
    sql: SOURCE_SCHEDULE,
  },
  {
    code: 'CLAIM_EVENT_DATE_SANE',
    version: '1.0.0',
    name: 'La fecha del hecho no está en el futuro',
    dimensionCode: 'ACCURACY',
    severity: 'ERROR',
    targetEntityType: 'FACT_CLAIM',
    scope: 'claims:with-event-date',
    sql: EVENT_DATE_SANE,
  },
  {
    code: 'CLAIM_UNIQUE_CONTENT',
    version: '1.0.0',
    name: 'El contenido afirmado no está duplicado por huella',
    dimensionCode: 'COHERENCE',
    severity: 'WARNING',
    targetEntityType: 'FACT_CLAIM',
    scope: 'claims:published-and-pending',
    sql: UNIQUE_CONTENT,
  },
  {
    code: 'OBSERVATION_HAS_UNIT',
    version: '1.0.0',
    name: 'Toda medida observada declara unidad',
    dimensionCode: 'COHERENCE',
    severity: 'ERROR',
    targetEntityType: 'OBSERVATION_MEASURE',
    scope: 'observation-measures:all',
    sql: OBSERVATION_UNIT,
  },
];
