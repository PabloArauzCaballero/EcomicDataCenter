import type { CreationAttributes } from 'sequelize';
import type {
  ObservationAttributeValueModel,
  ObservationMeasureModel,
  SeriesDimensionValueModel,
} from '../../database/models';
import type {
  AttributeValueInput,
  DimensionValueInput,
  MeasureValueInput,
} from './observation-input.schemas';

export function mapDimensionValue(
  seriesId: string,
  value: DimensionValueInput,
): CreationAttributes<SeriesDimensionValueModel> {
  return {
    seriesId,
    dimensionDefinitionId: value.dimensionDefinitionId,
    codeItemId: value.codeItemId ?? null,
    classificationItemId: value.classificationItemId ?? null,
    geographicUnitId: value.geographicUnitId ?? null,
    textValue: value.textValue ?? null,
    numericValue: value.numericValue ?? null,
    dateValue: value.dateValue ?? null,
  };
}

export function mapMeasureValue(
  observationRevisionId: string,
  value: MeasureValueInput,
): CreationAttributes<ObservationMeasureModel> {
  return {
    observationRevisionId,
    measureDefinitionId: value.measureDefinitionId,
    numericValue: value.numericValue ?? null,
    textValue: value.textValue ?? null,
    booleanValue: value.booleanValue ?? null,
  };
}

export function mapAttributeValue(
  observationRevisionId: string,
  value: AttributeValueInput,
): CreationAttributes<ObservationAttributeValueModel> {
  return {
    observationRevisionId,
    attributeDefinitionId: value.attributeDefinitionId,
    codeItemId: value.codeItemId ?? null,
    numericValue: value.numericValue ?? null,
    textValue: value.textValue ?? null,
    booleanValue: value.booleanValue ?? null,
  };
}
