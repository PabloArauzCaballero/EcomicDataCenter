import { Injectable } from '@nestjs/common';
import { QueryTypes } from 'sequelize';
import { ReadQueryExecutor } from '../../common/persistence/read-query.executor';
import { buildDataQueryPlan } from './data-query.plan';
import type { DataQueryInput } from './data-query.schemas';

export interface QueryRow {
  total_count: string;
  observation_id: string;
  series_id: string;
  series_key: string;
  period_start: string;
  period_end: string;
  period_code: string;
  reference_date: string | null;
  observation_revision_id: string;
  revision_number: number;
  publication_date: string | null;
  vintage_date: string;
  confidentiality_status: string;
  source_artifact_id: string;
  source_code: string;
  source_name: string;
  producer_organization_code: string;
  producer_organization_name: string;
  quality_summary: unknown;
  measures: unknown;
  attributes: unknown;
  dimensions: unknown;
}

@Injectable()
export class DataQueryRepository {
  constructor(private readonly executor: ReadQueryExecutor) {}

  async search(input: DataQueryInput): Promise<{ total: number; rows: readonly QueryRow[] }> {
    const plan = buildDataQueryPlan(input);
    const rows = await this.executor.run('observations.search', ({ database, transaction }) => database.query<QueryRow>(
      `
WITH selected AS (
  SELECT
    o.observation_id,
    o.series_id,
    s.series_key,
    o.period_start,
    o.period_end,
    o.period_code,
    o.reference_date,
    r.observation_revision_id,
    r.revision_number,
    r.publication_date,
    r.vintage_date,
    r.confidentiality_status,
    r.source_artifact_id,
    source.code AS source_code,
    source.name AS source_name,
    organization.code AS producer_organization_code,
    organization.legal_name AS producer_organization_name
  FROM statistics.observation o
  JOIN statistics.series s ON s.series_id = o.series_id
  JOIN LATERAL (
    SELECT candidate.*
    FROM statistics.observation_revision candidate
    WHERE candidate.observation_id = o.observation_id
      AND ${plan.revisionPredicate.replaceAll('r.', 'candidate.')}
    ORDER BY candidate.valid_from DESC, candidate.revision_number DESC
    LIMIT 1
  ) r ON true
  JOIN provenance.source_artifact artifact ON artifact.source_artifact_id = r.source_artifact_id
  JOIN provenance.source source ON source.source_id = artifact.source_id
  JOIN provenance.organization organization ON organization.organization_id = source.organization_id
  WHERE ${plan.predicates.join('\n    AND ')}
), paged AS (
  SELECT selected.*, COUNT(*) OVER() AS total_count
  FROM selected
  ORDER BY period_start ${plan.direction}, series_key ASC
  LIMIT :limit OFFSET :offset
)
SELECT
  paged.*,
  COALESCE((
    SELECT jsonb_agg(jsonb_build_object(
      'measureDefinitionId', measure.measure_definition_id,
      'code', definition.code,
      'name', definition.name,
      'numericValue', measure.numeric_value,
      'textValue', measure.text_value,
      'booleanValue', measure.boolean_value,
      'unitMeasureId', definition.unit_measure_id
    ) ORDER BY definition.code)
    FROM statistics.observation_measure measure
    JOIN metadata.measure_definition definition
      ON definition.measure_definition_id = measure.measure_definition_id
    WHERE measure.observation_revision_id = paged.observation_revision_id
  ), '[]'::jsonb) AS measures,
  COALESCE((
    SELECT jsonb_agg(jsonb_build_object(
      'attributeDefinitionId', attribute.attribute_definition_id,
      'code', definition.code,
      'codeItemId', attribute.code_item_id,
      'numericValue', attribute.numeric_value,
      'textValue', attribute.text_value,
      'booleanValue', attribute.boolean_value
    ) ORDER BY definition.code)
    FROM statistics.observation_attribute_value attribute
    JOIN metadata.attribute_definition definition
      ON definition.attribute_definition_id = attribute.attribute_definition_id
    WHERE attribute.observation_revision_id = paged.observation_revision_id
  ), '[]'::jsonb) AS attributes,
  COALESCE((
    SELECT jsonb_agg(jsonb_build_object(
      'dimensionDefinitionId', value.dimension_definition_id,
      'code', definition.code,
      'codeItemId', value.code_item_id,
      'classificationItemId', value.classification_item_id,
      'geographicUnitId', value.geographic_unit_id,
      'textValue', value.text_value,
      'numericValue', value.numeric_value,
      'dateValue', value.date_value
    ) ORDER BY definition.position_no)
    FROM statistics.series_dimension_value value
    JOIN metadata.dimension_definition definition
      ON definition.dimension_definition_id = value.dimension_definition_id
    WHERE value.series_id = paged.series_id
  ), '[]'::jsonb) AS dimensions,
  jsonb_build_object(
    'assessmentCount', (
      SELECT COUNT(*) FROM quality_lineage.quality_assessment assessment
      WHERE assessment.target_entity_type = 'OBSERVATION_REVISION'
        AND assessment.target_entity_id = paged.observation_revision_id::text
    ),
    'failedAssessmentCount', (
      SELECT COUNT(*) FROM quality_lineage.quality_assessment assessment
      WHERE assessment.target_entity_type = 'OBSERVATION_REVISION'
        AND assessment.target_entity_id = paged.observation_revision_id::text
        AND assessment.status = 'FAIL'
    ),
    'openIssueCount', (
      SELECT COUNT(*) FROM quality_lineage.data_issue issue
      WHERE issue.target_entity_type = 'OBSERVATION_REVISION'
        AND issue.target_entity_id = paged.observation_revision_id::text
        AND issue.status NOT IN ('VERIFIED', 'CLOSED')
    )
  ) AS quality_summary
FROM paged
ORDER BY period_start ${plan.direction}, series_key ASC
      `,
      { replacements: plan.replacements, type: QueryTypes.SELECT, transaction },
    ));
    return { total: Number(rows[0]?.total_count ?? 0), rows };
  }

}
