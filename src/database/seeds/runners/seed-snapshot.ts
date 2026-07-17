import { createHash } from 'node:crypto';
import { QueryTypes } from 'sequelize';
import type { Sequelize } from 'sequelize-typescript';
import { BOOT_FREQUENCY_IDS, BOOT_QUALITY_DIMENSION_IDS, BOOT_UNIT_IDS, MOCK_IDS } from '../seed-identifiers';

interface SnapshotRow {
  snapshot: unknown;
}

function canonicalize(value: unknown): unknown {
  if (Array.isArray(value)) return value.map(canonicalize);
  if (!value || typeof value !== 'object') return value;
  return Object.fromEntries(
    Object.entries(value as Record<string, unknown>)
      .sort(([left], [right]) => left.localeCompare(right))
      .map(([key, entry]) => [key, canonicalize(entry)]),
  );
}

function hashSnapshot(snapshot: unknown): string {
  return createHash('sha256').update(JSON.stringify(canonicalize(snapshot))).digest('hex');
}

async function querySnapshot(database: Sequelize, sql: string, replacements: Record<string, unknown>): Promise<string> {
  const [row] = await database.query<SnapshotRow>(sql, { replacements, type: QueryTypes.SELECT });
  if (!row) throw new Error('Seed snapshot query returned no row');
  return hashSnapshot(row.snapshot);
}

/** Captures all fields owned by boot seeds, not only row counts. */
export function captureBootSeedHash(database: Sequelize): Promise<string> {
  return querySnapshot(
    database,
    `SELECT jsonb_build_object(
      'frequencies', COALESCE((SELECT jsonb_agg(to_jsonb(item) ORDER BY item.code)
        FROM (SELECT frequency_id, code, name, periods_per_year, iso_duration
              FROM semantic.frequency WHERE frequency_id IN (:frequencyIds)) item), '[]'::jsonb),
      'qualityDimensions', COALESCE((SELECT jsonb_agg(to_jsonb(item) ORDER BY item.code)
        FROM (SELECT quality_dimension_id, code, name, description
              FROM quality_lineage.quality_dimension WHERE quality_dimension_id IN (:qualityIds)) item), '[]'::jsonb),
      'units', COALESCE((SELECT jsonb_agg(to_jsonb(item) ORDER BY item.code)
        FROM (SELECT unit_measure_id, base_unit_measure_id, code, name, symbol, multiplier_power10, value_kind
              FROM semantic.unit_measure WHERE unit_measure_id IN (:unitIds)) item), '[]'::jsonb)
    ) AS snapshot`,
    {
      frequencyIds: [...BOOT_FREQUENCY_IDS],
      qualityIds: [...BOOT_QUALITY_DIMENSION_IDS],
      unitIds: [...BOOT_UNIT_IDS],
    },
  );
}

/** Captures the complete deterministic mock aggregate and its relationships. */
export function captureMockSeedHash(database: Sequelize): Promise<string> {
  return querySnapshot(
    database,
    `SELECT jsonb_build_object(
      'organization', (SELECT to_jsonb(item) FROM (SELECT * FROM provenance.organization WHERE organization_id = :organizationId) item),
      'source', (SELECT to_jsonb(item) FROM (SELECT * FROM provenance.source WHERE source_id = :sourceId) item),
      'artifact', (SELECT to_jsonb(item) FROM (SELECT * FROM provenance.source_artifact WHERE source_artifact_id = :artifactId) item),
      'domain', (SELECT to_jsonb(item) FROM (SELECT * FROM semantic.statistical_domain WHERE statistical_domain_id = :domainId) item),
      'concepts', COALESCE((SELECT jsonb_agg(to_jsonb(item) ORDER BY item.code) FROM (SELECT * FROM semantic.concept WHERE owner_organization_id = :organizationId) item), '[]'::jsonb),
      'codeList', (SELECT to_jsonb(item) FROM (SELECT * FROM semantic.code_list WHERE code_list_id = :codeListId) item),
      'codeItems', COALESCE((SELECT jsonb_agg(to_jsonb(item) ORDER BY item.code) FROM (SELECT * FROM semantic.code_item WHERE code_list_id = :codeListId) item), '[]'::jsonb),
      'methodology', (SELECT to_jsonb(item) FROM (SELECT * FROM metadata.methodology WHERE methodology_id = :methodologyId) item),
      'methodologyVersion', (SELECT to_jsonb(item) FROM (SELECT * FROM metadata.methodology_version WHERE methodology_version_id = :methodologyVersionId) item),
      'structure', (SELECT to_jsonb(item) FROM (SELECT * FROM metadata.data_structure WHERE data_structure_id = :dataStructureId) item),
      'dimension', (SELECT to_jsonb(item) FROM (SELECT * FROM metadata.dimension_definition WHERE dimension_definition_id = :dimensionDefinitionId) item),
      'measure', (SELECT to_jsonb(item) FROM (SELECT * FROM metadata.measure_definition WHERE measure_definition_id = :measureDefinitionId) item),
      'dataset', (SELECT to_jsonb(item) FROM (SELECT * FROM metadata.dataset WHERE dataset_id = :datasetId) item),
      'datasetVersion', (SELECT to_jsonb(item) FROM (SELECT * FROM metadata.dataset_version WHERE dataset_version_id = :datasetVersionId) item),
      'indicator', (SELECT to_jsonb(item) FROM (SELECT * FROM statistics.indicator WHERE indicator_id = :indicatorId) item),
      'indicatorVersion', (SELECT to_jsonb(item) FROM (SELECT * FROM statistics.indicator_version WHERE indicator_version_id = :indicatorVersionId) item),
      'datasetIndicator', (SELECT to_jsonb(item) FROM (SELECT * FROM statistics.dataset_indicator WHERE dataset_indicator_id = :datasetIndicatorId) item)
    ) AS snapshot`,
    {
      organizationId: MOCK_IDS.organization,
      sourceId: MOCK_IDS.source,
      artifactId: MOCK_IDS.artifact,
      domainId: MOCK_IDS.domain,
      codeListId: MOCK_IDS.codeList,
      methodologyId: MOCK_IDS.methodology,
      methodologyVersionId: MOCK_IDS.methodologyVersion,
      dataStructureId: MOCK_IDS.dataStructure,
      dimensionDefinitionId: MOCK_IDS.dimensionDefinition,
      measureDefinitionId: MOCK_IDS.measureDefinition,
      datasetId: MOCK_IDS.dataset,
      datasetVersionId: MOCK_IDS.datasetVersion,
      indicatorId: MOCK_IDS.indicator,
      indicatorVersionId: MOCK_IDS.indicatorVersion,
      datasetIndicatorId: MOCK_IDS.datasetIndicator,
    },
  );
}
