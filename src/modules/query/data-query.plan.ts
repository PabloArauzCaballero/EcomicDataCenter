import { PUBLIC_CONFIDENTIALITY, type DisclosureScope } from '../../common/auth/disclosure.policy';
import type { DimensionValueInput } from '../../common/statistical/dimension-value.schema';
import type { DataQueryInput } from './data-query.schemas';
import { decodeCursor } from './pagination-cursor';

/**
 * Alias of the correlated subquery that selects one revision per observation.
 *
 * The predicate is built against this alias directly. An earlier version
 * rewrote `r.` into `candidate.` with a string replacement, which would have
 * silently corrupted any future alias or column containing that fragment.
 */
export const REVISION_CANDIDATE_ALIAS = 'candidate';

export interface DataQueryPlan {
  readonly replacements: Readonly<Record<string, unknown>>;
  readonly predicates: readonly string[];
  readonly revisionPredicate: string;
  readonly direction: 'ASC' | 'DESC';
  /** True when the client paginates by keyset and no total is computed. */
  readonly keyset: boolean;
}

/**
 * Builds a parameterized plan; only the validated sort direction is interpolated.
 *
 * The disclosure predicate is appended here rather than in the repository so
 * that no caller can build a query that omits it.
 */
export function buildDataQueryPlan(input: DataQueryInput, scope: DisclosureScope): DataQueryPlan {
  const replacements: Record<string, unknown> = {
    datasetVersionId: input.datasetVersionId,
    limit: input.pageSize,
    offset: input.cursor ? 0 : (input.page - 1) * input.pageSize,
  };
  const predicates = ['s.dataset_version_id = :datasetVersionId'];
  if (!scope.unrestricted) {
    replacements.publicConfidentiality = [...PUBLIC_CONFIDENTIALITY];
    if (scope.organizationId) {
      replacements.scopeOrganizationId = scope.organizationId;
      predicates.push(
        '(r.confidentiality_status IN (:publicConfidentiality)' +
          ' OR dataset_owner.producer_organization_id = :scopeOrganizationId)',
      );
    } else {
      predicates.push('r.confidentiality_status IN (:publicConfidentiality)');
    }
  }

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

  if (input.cursor) {
    const cursor = decodeCursor(input.cursor);
    replacements.cursorPeriodStart = cursor.periodStart;
    replacements.cursorSeriesKey = cursor.seriesKey;
    // The keyset predicate must mirror the emitted ORDER BY exactly, and the
    // tie-breaker `series_key` is always ascending regardless of the period
    // direction. A symmetric tuple comparison would instead mean
    // `series_key DESC` on a descending page: rows tied on period_start would
    // then be re-served on the next page while their successors were skipped.
    predicates.push(
      input.sortDirection === 'desc'
        ? '(o.period_start < :cursorPeriodStart::date' +
            ' OR (o.period_start = :cursorPeriodStart::date AND s.series_key > :cursorSeriesKey))'
        : '(o.period_start, s.series_key) > (:cursorPeriodStart::date, :cursorSeriesKey)',
    );
  }

  if (input.vintageDate) replacements.vintageCutoff = `${input.vintageDate}T23:59:59.999Z`;
  return {
    replacements,
    predicates,
    keyset: input.cursor !== undefined,
    revisionPredicate: input.vintageDate
      ? `${REVISION_CANDIDATE_ALIAS}.status = 'PUBLISHED'
         AND ${REVISION_CANDIDATE_ALIAS}.valid_from <= :vintageCutoff
         AND (${REVISION_CANDIDATE_ALIAS}.valid_to IS NULL
              OR ${REVISION_CANDIDATE_ALIAS}.valid_to > :vintageCutoff)`
      : `${REVISION_CANDIDATE_ALIAS}.status = 'PUBLISHED'
         AND ${REVISION_CANDIDATE_ALIAS}.is_current = true`,
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
