import 'dotenv/config';
import { getEnvironment } from '../../src/config/environment';
import { createReaderDatabase } from '../../src/database/database.factory';

/**
 * Scores every collection batch against the five quality dimensions the
 * observatory already declares.
 *
 * The dimensions are the seed catalogue's own — RELEVANCE, ACCURACY,
 * TIMELINESS, COHERENCE, ACCESSIBILITY — and each is measured rather than
 * judged. Nothing here is a rating someone assigned: every number is a count
 * of rows that satisfy a stated condition, so a batch that scores badly can be
 * argued with by disputing the condition rather than the opinion.
 *
 * ACCURACY is the one worth explaining. It asks whether the figure a record
 * states can be found in the evidence stored beside it. That is the whole claim
 * this observatory makes — every number traceable to a document — so a batch
 * that scores under 100 there has records nobody can check, which matters more
 * than any other column.
 *
 * Run with `yarn quality:sources`.
 */

interface BatchRow {
  batch: string;
  records: string;
  documents: string;
  first_day: string | null;
  last_day: string | null;
  lag_days: string | null;
  with_source: string;
  with_evidence: string;
  grounded: string;
  distinct_keys: string;
}

const QUERY = `
WITH claim AS (
  SELECT
    agent.code                                   AS batch,
    fc.fact_claim_id,
    fc.event_date,
    ro.source_artifact_id,
    ro.payload_json,
    ro.payload_json ->> 'url'                    AS source_url,
    -- What makes a record unique: for a series, the day it describes; for an
    -- article, its own address. A daily series shares one source URL across
    -- every point by design, so the URL alone is not a key.
    coalesce(ro.payload_json ->> 'headline', ro.payload_json ->> 'url', fc.assertion)
      || '|' || coalesce(fc.event_date::text, '')
      || '|' || coalesce(ro.payload_json #>> '{measures,0,indicatorCode}', '')
                                                 AS natural_key,
    evidence.excerpt
  FROM intelligence.fact_claim fc
  JOIN intelligence.raw_observation ro ON ro.raw_observation_id = fc.raw_observation_id
  JOIN intelligence.agent_run run ON run.agent_run_id = ro.agent_run_id
  JOIN intelligence.ai_agent agent ON agent.ai_agent_id = run.ai_agent_id
  LEFT JOIN LATERAL (
    SELECT string_agg(ce.excerpt, ' ') AS excerpt
    FROM intelligence.claim_evidence ce
    WHERE ce.fact_claim_id = fc.fact_claim_id
  ) AS evidence ON true
  WHERE fc.status = 'PUBLISHED'
),
measured AS (
  SELECT
    claim.*,
    -- The figure a reading states, in the form its source prints it. Where a
    -- publisher writes 4.633,57 the record keeps that alongside the normalised
    -- 4633.57, and it is the printed form a reader finds on the page — so it is
    -- the printed form that has to occur in the evidence.
    (
      SELECT string_agg(coalesce(measure ->> 'statedValue', measure ->> 'value'), ' ')
      FROM jsonb_array_elements(
        CASE
          WHEN jsonb_typeof(claim.payload_json -> 'measures') = 'array'
          THEN claim.payload_json -> 'measures'
          ELSE '[]'::jsonb
        END
      ) AS measure
    ) AS stated_values
  FROM claim
)
SELECT
  batch,
  count(*)::text                                                        AS records,
  count(DISTINCT source_artifact_id)::text                              AS documents,
  min(event_date)::text                                                 AS first_day,
  max(event_date)::text                                                 AS last_day,
  (current_date - max(event_date))::text                                AS lag_days,
  count(*) FILTER (WHERE source_url IS NOT NULL)::text                  AS with_source,
  count(*) FILTER (WHERE excerpt IS NOT NULL AND length(excerpt) > 0)::text AS with_evidence,
  -- Grounded: every stated figure occurs literally in the evidence. A record
  -- with no figure is grounded by its evidence existing at all.
  count(*) FILTER (
    WHERE excerpt IS NOT NULL
      AND (
        stated_values IS NULL
        OR NOT EXISTS (
          SELECT 1
          FROM unnest(string_to_array(stated_values, ' ')) AS stated
          WHERE stated <> '' AND position(stated IN excerpt) = 0
        )
      )
  )::text                                                               AS grounded,
  count(DISTINCT natural_key)::text                                     AS distinct_keys
FROM measured
GROUP BY batch
ORDER BY count(*) DESC;
`;

const share = (part: number, whole: number): string =>
  whole === 0 ? '   —' : `${((part / whole) * 100).toFixed(0).padStart(3)}%`;

function verdict(row: BatchRow): string {
  const records = Number(row.records);
  const grounded = Number(row.grounded);
  const duplicates = records - Number(row.distinct_keys);
  const lag = Number(row.lag_days ?? '0');
  if (grounded < records) return 'REVISAR: hay cifras sin respaldo literal';
  if (duplicates > 0) return `REVISAR: ${duplicates} registros comparten clave`;
  if (lag > 400) return 'histórico: por diseño no se actualiza';
  if (lag > 7) return `atrasado ${lag} días`;
  return 'al día';
}

async function main(): Promise<void> {
  const database = createReaderDatabase(getEnvironment());
  try {
    const [rows] = await database.query(QUERY);
    const batches = rows as unknown as BatchRow[];

    console.log('CALIDAD POR TANDA DE RECOLECCIÓN');
    console.log(
      '(dimensiones del catálogo del proyecto; cada columna es un conteo, no una nota)\n',
    );
    console.log(
      'tanda                        registros  docs  exacta  trazable  única  atraso  rango',
    );
    console.log('-'.repeat(104));

    let worst = 100;
    for (const row of batches) {
      const records = Number(row.records);
      const accuracy = share(Number(row.grounded), records);
      const access = share(Number(row.with_source), records);
      const unique = share(Number(row.distinct_keys), records);
      worst = Math.min(worst, (Number(row.grounded) / (records || 1)) * 100);
      console.log(
        `${row.batch.padEnd(28)} ${row.records.padStart(9)} ${row.documents.padStart(5)}  ` +
          `${accuracy}    ${access}    ${unique}  ${(row.lag_days ?? '?').padStart(5)}d  ` +
          `${row.first_day ?? '?'} → ${row.last_day ?? '?'}`,
      );
    }

    console.log('\nDIAGNÓSTICO');
    for (const row of batches) console.log(`  ${row.batch.padEnd(28)} ${verdict(row)}`);
    console.log(
      `\nExactitud mínima entre tandas: ${worst.toFixed(1)} %` +
        (worst < 100
          ? '  ← hay cifras que nadie puede comprobar'
          : '  (toda cifra es comprobable)'),
    );
  } finally {
    await database.close();
  }
}

main().catch((error: unknown) => {
  process.stderr.write(`${error instanceof Error ? error.message : 'Quality run failed'}\n`);
  process.exitCode = 1;
});
