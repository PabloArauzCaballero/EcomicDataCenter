import type { QueryRow } from './data-query.repository';

/** Maps database-oriented aliases to the public API contract. */
export function mapQueryRow(row: QueryRow): Record<string, unknown> {
  return {
    observationId: row.observation_id,
    seriesId: row.series_id,
    seriesKey: row.series_key,
    periodStart: row.period_start,
    periodEnd: row.period_end,
    periodCode: row.period_code,
    referenceDate: row.reference_date,
    revisionId: row.observation_revision_id,
    revisionNumber: row.revision_number,
    publicationDate: row.publication_date,
    vintageDate: row.vintage_date,
    confidentialityStatus: row.confidentiality_status,
    sourceArtifactId: row.source_artifact_id,
    source: {
      code: row.source_code,
      name: row.source_name,
      producerOrganizationCode: row.producer_organization_code,
      producerOrganizationName: row.producer_organization_name,
    },
    dimensions: row.dimensions,
    measures: row.measures,
    attributes: row.attributes,
    quality: row.quality_summary,
  };
}
