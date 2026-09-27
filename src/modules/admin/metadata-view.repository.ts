import { Injectable } from '@nestjs/common';
import { QueryTypes } from 'sequelize';
import { ReadQueryExecutor } from '../../common/persistence/read-query.executor';
import type { MetadataCatalog } from './admin.schemas';

export interface CatalogEntry {
  readonly identity: string;
  readonly code: string;
  readonly name: string;
  readonly detail: string | null;
  readonly active: boolean | null;
  readonly references: number;
}

interface CatalogRow {
  identity: string;
  code: string;
  name: string;
  detail: string | null;
  active: boolean | null;
  references: string;
}

/**
 * The SQL for each catalogue the portal may show, chosen by name.
 *
 * A statement per catalogue, written out, rather than a table name taken from
 * the request and interpolated. The second form is shorter and is a SQL
 * injection with extra steps; it also makes «which catalogues are safe to show
 * in full» a question nobody ever has to answer. The `references` column is the
 * one that changes what an operator may do: an entry something else points at
 * cannot simply be edited away.
 */
const CATALOG_QUERIES: Readonly<Record<MetadataCatalog, string>> = {
  frequencies: `
SELECT frequency_id::text AS identity, code, name, iso_duration AS detail,
       NULL::boolean AS active,
       (SELECT COUNT(*) FROM provenance.source source
         WHERE source.frequency_id = frequency.frequency_id)::text AS references
FROM semantic.frequency frequency ORDER BY code`,
  units: `
SELECT unit_measure_id::text AS identity, code, name, symbol AS detail,
       NULL::boolean AS active,
       (SELECT COUNT(*) FROM metadata.measure_definition measure
         WHERE measure.unit_measure_id = unit.unit_measure_id)::text AS references
FROM semantic.unit_measure unit ORDER BY code`,
  'geographic-units': `
SELECT geographic_unit_id::text AS identity, official_code AS code, name,
       geographic_level AS detail, NULL::boolean AS active,
       (SELECT COUNT(*) FROM semantic.geographic_unit child
         WHERE child.parent_geographic_unit_id = unit.geographic_unit_id)::text AS references
FROM semantic.geographic_unit unit ORDER BY official_code`,
  'statistical-domains': `
SELECT statistical_domain_id::text AS identity, code, name, description AS detail,
       is_active AS active,
       (SELECT COUNT(*) FROM semantic.statistical_domain child
         WHERE child.parent_domain_id = domain.statistical_domain_id)::text AS references
FROM semantic.statistical_domain domain ORDER BY sort_order, code`,
  'quality-dimensions': `
SELECT quality_dimension_id::text AS identity, code, name, description AS detail,
       NULL::boolean AS active,
       (SELECT COUNT(*) FROM quality_lineage.quality_rule rule
         WHERE rule.quality_dimension_id = dimension.quality_dimension_id)::text AS references
FROM quality_lineage.quality_dimension dimension ORDER BY code`,
  organizations: `
SELECT organization_id::text AS identity, code, legal_name AS name,
       organization_type AS detail, (valid_to IS NULL) AS active,
       (SELECT COUNT(*) FROM provenance.source source
         WHERE source.organization_id = organization.organization_id)::text AS references
FROM provenance.organization organization ORDER BY code`,
  sources: `
SELECT source_id::text AS identity, code, name, source_type AS detail, is_active AS active,
       (SELECT COUNT(*) FROM provenance.source_artifact artifact
         WHERE artifact.source_id = source.source_id)::text AS references
FROM provenance.source source ORDER BY code`,
  datasets: `
SELECT dataset_id::text AS identity, code, name, NULL AS detail, NULL::boolean AS active,
       (SELECT COUNT(*) FROM metadata.dataset_version version
         WHERE version.dataset_id = dataset.dataset_id)::text AS references
FROM metadata.dataset dataset ORDER BY code`,
  indicators: `
SELECT indicator_id::text AS identity, code, name, NULL AS detail, NULL::boolean AS active,
       (SELECT COUNT(*) FROM statistics.indicator_version version
         WHERE version.indicator_id = indicator.indicator_id)::text AS references
FROM statistics.indicator indicator ORDER BY code`,
  methodologies: `
SELECT methodology_id::text AS identity, code, name, NULL AS detail, NULL::boolean AS active,
       (SELECT COUNT(*) FROM metadata.methodology_version version
         WHERE version.methodology_id = methodology.methodology_id)::text AS references
FROM metadata.methodology methodology ORDER BY code`,
};

@Injectable()
export class MetadataViewRepository {
  constructor(private readonly executor: ReadQueryExecutor) {}

  async read(catalog: MetadataCatalog): Promise<CatalogEntry[]> {
    const sql = CATALOG_QUERIES[catalog];
    const rows = await this.executor.run(
      'operations.metadata_catalog',
      ({ database, transaction }) =>
        database.query<CatalogRow>(sql, { type: QueryTypes.SELECT, transaction }),
    );
    return rows.map((row) => ({
      identity: row.identity,
      code: row.code,
      name: row.name,
      detail: row.detail,
      active: row.active,
      references: Number(row.references),
    }));
  }
}
