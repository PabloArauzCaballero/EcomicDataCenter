import { createHash } from 'node:crypto';
import type {
  AttributeValueInput,
  DimensionValueInput,
  MeasureValueInput,
  ObservationRecordInput,
} from './observation-input.schemas';

interface OrderedDimension extends DimensionValueInput {
  code: string;
  position: number;
}

function stableHash(value: unknown): string {
  return createHash('sha256').update(JSON.stringify(value)).digest('hex');
}

function dimensionToken(dimension: DimensionValueInput): string {
  if (dimension.codeItemId) return `code:${dimension.codeItemId}`;
  if (dimension.classificationItemId) return `classification:${dimension.classificationItemId}`;
  if (dimension.geographicUnitId) return `geography:${dimension.geographicUnitId}`;
  if (dimension.textValue !== undefined) return `text:${dimension.textValue.normalize('NFC')}`;
  if (dimension.numericValue !== undefined) return `numeric:${dimension.numericValue}`;
  if (dimension.dateValue !== undefined) return `date:${dimension.dateValue}`;
  throw new Error('Dimension was not validated');
}

function normalizedMeasure(measure: MeasureValueInput): readonly unknown[] {
  return [
    measure.measureDefinitionId,
    measure.numericValue ?? null,
    measure.textValue?.normalize('NFC') ?? null,
    measure.booleanValue ?? null,
  ];
}

function normalizedAttribute(attribute: AttributeValueInput): readonly unknown[] {
  return [
    attribute.attributeDefinitionId,
    attribute.codeItemId ?? null,
    attribute.numericValue ?? null,
    attribute.textValue?.normalize('NFC') ?? null,
    attribute.booleanValue ?? null,
  ];
}

export function buildSeriesIdentity(dimensions: readonly OrderedDimension[]): {
  seriesKey: string;
  seriesKeyHash: string;
} {
  const sorted = [...dimensions].sort((left, right) => left.position - right.position);
  const seriesKey = sorted.map((item) => `${item.code}=${dimensionToken(item)}`).join('|');
  return { seriesKey, seriesKeyHash: stableHash(seriesKey) };
}

export function buildRevisionHash(record: ObservationRecordInput): string {
  return stableHash({
    period: [record.periodStart, record.periodEnd, record.periodCode, record.referenceDate ?? null],
    release: [
      record.publicationDate ?? null,
      record.vintageDate,
      record.revisionReason?.normalize('NFC') ?? null,
    ],
    measures: [...record.measures].sort((a, b) =>
      a.measureDefinitionId.localeCompare(b.measureDefinitionId),
    ).map(normalizedMeasure),
    attributes: [...record.attributes].sort((a, b) =>
      a.attributeDefinitionId.localeCompare(b.attributeDefinitionId),
    ).map(normalizedAttribute),
    confidentialityStatus: record.confidentialityStatus,
  });
}
