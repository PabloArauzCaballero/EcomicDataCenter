import { Injectable } from '@nestjs/common';
import { QueryTypes } from 'sequelize';
import { NotFoundError } from '../../common/errors/application.error';
import { ReadQueryExecutor } from '../../common/persistence/read-query.executor';

@Injectable()
export class TraceRepository {
  constructor(private readonly executor: ReadQueryExecutor) {}

  getTrace(observationId: string, revisionId: string): Promise<Record<string, unknown>> {
    return this.executor.run('observations.trace', async ({ database, transaction }) => {
      const replacements = { observationId, revisionId };
      const [core, quality, issues, lineage, breaks] = await Promise.all([
        database.query<Record<string, unknown>>(
          `SELECT jsonb_build_object(
            'observationId', o.observation_id, 'revisionId', r.observation_revision_id,
            'revisionNumber', r.revision_number, 'status', r.status, 'vintageDate', r.vintage_date,
            'publicationDate', r.publication_date, 'seriesId', s.series_id, 'seriesKey', s.series_key,
            'datasetVersionId', dv.dataset_version_id, 'datasetVersion', dv.version_code,
            'datasetId', d.dataset_id, 'datasetCode', d.code, 'datasetName', d.name,
            'dataNature', d.data_nature, 'methodologyVersionId', mv.methodology_version_id,
            'methodologyVersion', mv.version_code, 'sourceArtifactId', artifact.source_artifact_id,
            'artifactSha256', artifact.sha256, 'batchId', batch.data_entry_batch_id,
            'batchCode', batch.batch_code, 'sourceId', source.source_id, 'sourceCode', source.code,
            'sourceName', source.name, 'producerOrganizationId', organization.organization_id,
            'producerOrganization', organization.legal_name
          ) AS trace
          FROM statistics.observation o
          JOIN statistics.observation_revision r ON r.observation_id = o.observation_id
          JOIN statistics.series s ON s.series_id = o.series_id
          JOIN metadata.dataset_version dv ON dv.dataset_version_id = s.dataset_version_id
          JOIN metadata.dataset d ON d.dataset_id = dv.dataset_id
          JOIN metadata.methodology_version mv ON mv.methodology_version_id = dv.methodology_version_id
          JOIN provenance.source_artifact artifact ON artifact.source_artifact_id = r.source_artifact_id
          JOIN provenance.data_entry_batch batch ON batch.data_entry_batch_id = r.data_entry_batch_id
          JOIN provenance.source source ON source.source_id = artifact.source_id
          JOIN provenance.organization organization ON organization.organization_id = source.organization_id
          WHERE o.observation_id = :observationId AND r.observation_revision_id = :revisionId`,
          { replacements, type: QueryTypes.SELECT, transaction },
        ),
        database.query<Record<string, unknown>>(
          `SELECT quality_assessment_id, quality_rule_id, status, score, message, assessed_at
           FROM quality_lineage.quality_assessment
           WHERE target_entity_type = 'OBSERVATION_REVISION' AND target_entity_id = :revisionId
           ORDER BY assessed_at`,
          { replacements, type: QueryTypes.SELECT, transaction },
        ),
        database.query<Record<string, unknown>>(
          `SELECT data_issue_id, quality_rule_id, issue_code, severity, status, title, description,
                  detected_at, resolved_at, resolution_notes
           FROM quality_lineage.data_issue
           WHERE target_entity_type = 'OBSERVATION_REVISION' AND target_entity_id = :revisionId
           ORDER BY detected_at`,
          { replacements, type: QueryTypes.SELECT, transaction },
        ),
        database.query<Record<string, unknown>>(
          `SELECT lineage_relation_id, methodology_version_id, source_entity_type, source_entity_id,
                  target_entity_type, target_entity_id, relation_type, transformation_description,
                  formula, created_at
           FROM quality_lineage.lineage_relation
           WHERE (target_entity_type = 'OBSERVATION_REVISION' AND target_entity_id = :revisionId)
              OR (source_entity_type = 'OBSERVATION_REVISION' AND source_entity_id = :revisionId)
           ORDER BY created_at`,
          { replacements, type: QueryTypes.SELECT, transaction },
        ),
        database.query<Record<string, unknown>>(
          `SELECT series_break_row.series_break_id, series_break_row.series_id,
                  series_break_row.break_date, series_break_row.break_type,
                  series_break_row.description, series_break_row.comparable_before_after,
                  series_break_row.bridge_methodology_version_id, series_break_row.created_at
           FROM quality_lineage.series_break series_break_row
           JOIN statistics.observation observation ON observation.series_id = series_break_row.series_id
           WHERE observation.observation_id = :observationId
           ORDER BY series_break_row.break_date`,
          { replacements, type: QueryTypes.SELECT, transaction },
        ),
      ]);
      if (!core[0]) throw new NotFoundError('observation_revision', revisionId);
      return {
        ...(core[0].trace as Record<string, unknown>),
        qualityAssessments: quality,
        dataIssues: issues,
        lineageRelations: lineage,
        seriesBreaks: breaks,
      };
    });
  }
}
