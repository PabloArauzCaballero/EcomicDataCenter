import type { DimensionValueInput } from '../../common/statistical/dimension-value.schema';
import type { DataQueryInput } from './data-query.schemas';

export interface DataQueryPlan {
  readonly replacements: Readonly<Record<string, unknown>>;
  readonly predicates: readonly string[];
  readonly revisionPredicate: string;
  readonly direction: 'ASC' | 'DESC';
}

/** Builds a parameterized plan; only the validated sort direction is interpolated. */
export function buildDataQueryPlan(input: DataQueryInput): DataQueryPlan {
  const replacements: Record<string, unknown> = {
    datasetVersionId: input.datasetVersionId,
    limit: input.pageSize,
    offset: (input.page - 1) * input.pageSize,
  };
  const predicates = ['s.dataset_version_id = :datasetVersionId'];

  if (input.indicatorVersionId) {
    predicates.push('s.indicator_version_id = :indicatorVersionId');
    replacements.indicatorVersionId = input.indicatorVersionId;
  }
  if (input.periodFrom) {
    predicates.push('o.period_end >= :periodFrom');
    replacements.periodFrom = input.periodFrom;
  }
  if (input.periodTo) {
    predicates.push('o.period_start <= :periodTo');
    replacements.periodTo = input.periodTo;
  }
  predicates.push(
    ...input.dimensions.map((filter, index) => dimensionPredicate(filter, index, replacements)),
  );

  if (input.vintageDate) replacements.vintageCutoff = `${input.vintageDate}T23:59:59.999Z`;
  return {
    replacements,
    predicates,
    revisionPredicate: input.vintageDate
      ? `r.status = 'PUBLISHED' AND r.valid_from <= :vintageCutoff
         AND (r.valid_to IS NULL OR r.valid_to > :vintageCutoff)`
      : `r.status = 'PUBLISHED' AND r.is_current = true`,
    direction: input.sortDirection === 'desc' ? 'DESC' : 'ASC',
  };
}

function dimensionPredicate(
  filter: DimensionValueInput,
  index: number,
  replacements: Record<string, unknown>,
): string {
  replacements[`dimensionDefinitionId${index}`] = filter.dimensionDefinitionId;
  const mapping: readonly [keyof DimensionValueInput, string][] = [
    ['codeItemId', 'code_item_id'],
    ['classificationItemId', 'classification_item_id'],
    ['geographicUnitId', 'geographic_unit_id'],
    ['textValue', 'text_value'],
    ['numericValue', 'numeric_value'],
    ['dateValue', 'date_value'],
  ];
  const selected = mapping.find(([property]) => filter[property] !== undefined);
  if (!selected) throw new Error('Validated dimension filter has no value');
  const [property, column] = selected;
  replacements[`dimensionValue${index}`] = filter[property];
  return `EXISTS (
      SELECT 1 FROM statistics.series_dimension_value filter_${index}
      WHERE filter_${index}.series_id = s.series_id
        AND filter_${index}.dimension_definition_id = :dimensionDefinitionId${index}
        AND filter_${index}.${column} = :dimensionValue${index}
    )`;
}
