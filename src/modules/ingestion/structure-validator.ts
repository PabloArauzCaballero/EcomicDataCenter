import { BusinessRuleError } from '../../common/errors/application.error';
import type {
  AttributeValueInput,
  DimensionValueInput,
  MeasureValueInput,
  ObservationRecordInput,
} from './observation-input.schemas';
import type { StructureSnapshot } from './structure.repository';

function assertExactDefinitions(
  actualIds: readonly string[],
  allowedIds: ReadonlySet<string>,
  requiredIds: readonly string[],
  kind: string,
): void {
  const unknown = actualIds.filter((id) => !allowedIds.has(id));
  const missing = requiredIds.filter((id) => !actualIds.includes(id));
  if (unknown.length || missing.length) {
    throw new BusinessRuleError(`Observation ${kind} do not match the data structure`, {
      unknown,
      missing,
    });
  }
}

function dimensionValueKind(value: DimensionValueInput): string {
  if (value.codeItemId) return 'CODE_LIST';
  if (value.classificationItemId) return 'CLASSIFICATION';
  if (value.geographicUnitId) return 'GEOGRAPHY';
  if (value.textValue !== undefined) return 'TEXT';
  if (value.numericValue !== undefined) return 'NUMERIC';
  return 'DATE';
}

function measureValueKind(value: MeasureValueInput): string {
  if (value.numericValue !== undefined) return 'NUMERIC';
  if (value.textValue !== undefined) return 'TEXT';
  return 'BOOLEAN';
}

function attributeValueKind(value: AttributeValueInput): string {
  if (value.codeItemId) return 'CODE';
  if (value.numericValue !== undefined) return 'NUMERIC';
  if (value.textValue !== undefined) return 'TEXT';
  return 'BOOLEAN';
}

/** Validates definition membership and representation before persistence. */
export function validateRecordAgainstStructure(
  record: ObservationRecordInput,
  structure: StructureSnapshot,
): void {
  const nonTimeDimensions = structure.dimensions.filter((definition) => !definition.isTimeDimension);
  assertExactDefinitions(
    record.dimensions.map((value) => value.dimensionDefinitionId),
    new Set(nonTimeDimensions.map((definition) => definition.dimensionDefinitionId)),
    nonTimeDimensions.filter((definition) => definition.isRequired).map((definition) => definition.dimensionDefinitionId),
    'dimensions',
  );
  assertExactDefinitions(
    record.measures.map((value) => value.measureDefinitionId),
    new Set(structure.measures.map((definition) => definition.measureDefinitionId)),
    structure.measures.filter((definition) => definition.isPrimaryMeasure).map((definition) => definition.measureDefinitionId),
    'measures',
  );
  assertExactDefinitions(
    record.attributes.map((value) => value.attributeDefinitionId),
    new Set(structure.attributes.map((definition) => definition.attributeDefinitionId)),
    structure.attributes.filter((definition) => definition.isRequired).map((definition) => definition.attributeDefinitionId),
    'attributes',
  );

  const dimensions = new Map(
    structure.dimensions.map((definition) => [definition.dimensionDefinitionId, definition]),
  );
  for (const value of record.dimensions) {
    const definition = dimensions.get(value.dimensionDefinitionId);
    if (definition && dimensionValueKind(value) !== definition.representationKind) {
      throw new BusinessRuleError('Dimension value does not match its representation', {
        dimensionDefinitionId: definition.dimensionDefinitionId,
        expected: definition.representationKind,
        received: dimensionValueKind(value),
      });
    }
  }

  const measures = new Map(
    structure.measures.map((definition) => [definition.measureDefinitionId, definition]),
  );
  for (const value of record.measures) {
    const definition = measures.get(value.measureDefinitionId);
    if (definition && measureValueKind(value) !== definition.dataType) {
      throw new BusinessRuleError('Measure value does not match its data type', {
        measureDefinitionId: definition.measureDefinitionId,
        expected: definition.dataType,
        received: measureValueKind(value),
      });
    }
  }

  const attributes = new Map(
    structure.attributes.map((definition) => [definition.attributeDefinitionId, definition]),
  );
  for (const value of record.attributes) {
    const definition = attributes.get(value.attributeDefinitionId);
    if (definition && attributeValueKind(value) !== definition.dataType) {
      throw new BusinessRuleError('Attribute value does not match its data type', {
        attributeDefinitionId: definition.attributeDefinitionId,
        expected: definition.dataType,
        received: attributeValueKind(value),
      });
    }
  }
}
