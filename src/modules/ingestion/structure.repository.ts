import { Injectable } from '@nestjs/common';
import { Op, type Transaction } from 'sequelize';
import { BusinessRuleError, NotFoundError } from '../../common/errors/application.error';
import {
  AttributeDefinitionModel,
  ClassificationItemModel,
  CodeItemModel,
  DatasetIndicatorModel,
  DatasetVersionModel,
  DimensionDefinitionModel,
  FrequencyModel,
  GeographicUnitModel,
  IndicatorVersionModel,
  MeasureDefinitionModel,
  UnitMeasureModel,
} from '../../database/models';
import type { ObservationRecordInput } from './observation-input.schemas';

export interface StructureSnapshot {
  datasetVersion: DatasetVersionModel;
  dimensions: readonly DimensionDefinitionModel[];
  measures: readonly MeasureDefinitionModel[];
  attributes: readonly AttributeDefinitionModel[];
}

@Injectable()
export class StructureRepository {
  async loadPublishedDatasetVersion(
    datasetVersionId: string,
    transaction: Transaction,
  ): Promise<StructureSnapshot> {
    const datasetVersion = await DatasetVersionModel.findByPk(datasetVersionId, { transaction });
    if (!datasetVersion) throw new NotFoundError('dataset_version', datasetVersionId);
    if (datasetVersion.status !== 'PUBLISHED') {
      throw new BusinessRuleError('Only a published dataset version accepts observations', {
        datasetVersionId,
        status: datasetVersion.status,
      });
    }
    const [dimensions, measures, attributes] = await Promise.all([
      DimensionDefinitionModel.findAll({
        where: { dataStructureId: datasetVersion.dataStructureId },
        order: [['positionNo', 'ASC']],
        transaction,
      }),
      MeasureDefinitionModel.findAll({
        where: { dataStructureId: datasetVersion.dataStructureId },
        transaction,
      }),
      AttributeDefinitionModel.findAll({
        where: { dataStructureId: datasetVersion.dataStructureId },
        transaction,
      }),
    ]);
    return { datasetVersion, dimensions, measures, attributes };
  }

  async assertReferencedValues(
    record: ObservationRecordInput,
    structure: StructureSnapshot,
    transaction: Transaction,
  ): Promise<void> {
    const [frequency, unit, indicatorLink] = await Promise.all([
      FrequencyModel.findByPk(record.frequencyId, { transaction }),
      record.unitMeasureId
        ? UnitMeasureModel.findByPk(record.unitMeasureId, { transaction })
        : null,
      record.indicatorVersionId
        ? DatasetIndicatorModel.findOne({
            where: {
              datasetVersionId: structure.datasetVersion.datasetVersionId,
              indicatorVersionId: record.indicatorVersionId,
            },
            transaction,
          })
        : null,
    ]);
    if (!frequency) throw new NotFoundError('frequency', record.frequencyId);
    if (record.unitMeasureId && !unit)
      throw new NotFoundError('unit_measure', record.unitMeasureId);
    if (record.indicatorVersionId && !indicatorLink) {
      const indicator = await IndicatorVersionModel.findByPk(record.indicatorVersionId, {
        transaction,
      });
      if (!indicator) throw new NotFoundError('indicator_version', record.indicatorVersionId);
      throw new BusinessRuleError('Indicator version is not linked to the dataset version');
    }

    await this.assertDimensionReferences(record, structure, transaction);
    await this.assertAttributeReferences(record, structure, transaction);
  }

  private async assertDimensionReferences(
    record: ObservationRecordInput,
    structure: StructureSnapshot,
    transaction: Transaction,
  ): Promise<void> {
    const codeIds = record.dimensions.flatMap((value) =>
      value.codeItemId ? [value.codeItemId] : [],
    );
    const classificationIds = record.dimensions.flatMap((value) =>
      value.classificationItemId ? [value.classificationItemId] : [],
    );
    const geographyIds = record.dimensions.flatMap((value) =>
      value.geographicUnitId ? [value.geographicUnitId] : [],
    );
    const [codes, classifications, geographies] = await Promise.all([
      CodeItemModel.findAll({ where: { codeItemId: { [Op.in]: codeIds } }, transaction }),
      ClassificationItemModel.findAll({
        where: { classificationItemId: { [Op.in]: classificationIds } },
        transaction,
      }),
      GeographicUnitModel.findAll({
        where: { geographicUnitId: { [Op.in]: geographyIds } },
        transaction,
      }),
    ]);
    const codeById = new Map(codes.map((item) => [item.codeItemId, item]));
    const classificationById = new Map(
      classifications.map((item) => [item.classificationItemId, item]),
    );
    const geographySet = new Set(geographies.map((item) => item.geographicUnitId));
    const definitionById = new Map(
      structure.dimensions.map((definition) => [definition.dimensionDefinitionId, definition]),
    );

    for (const value of record.dimensions) {
      const definition = definitionById.get(value.dimensionDefinitionId);
      if (
        value.codeItemId &&
        codeById.get(value.codeItemId)?.codeListId !== definition?.codeListId
      ) {
        throw new BusinessRuleError('Code item does not belong to the dimension code list');
      }
      if (
        value.classificationItemId &&
        classificationById.get(value.classificationItemId)?.classificationVersionId !==
          definition?.classificationVersionId
      ) {
        throw new BusinessRuleError('Classification item does not belong to the dimension version');
      }
      if (value.geographicUnitId && !geographySet.has(value.geographicUnitId)) {
        throw new NotFoundError('geographic_unit', value.geographicUnitId);
      }
    }
  }

  private async assertAttributeReferences(
    record: ObservationRecordInput,
    structure: StructureSnapshot,
    transaction: Transaction,
  ): Promise<void> {
    const codeIds = record.attributes.flatMap((value) =>
      value.codeItemId ? [value.codeItemId] : [],
    );
    if (codeIds.length === 0) return;
    const codes = await CodeItemModel.findAll({
      where: { codeItemId: { [Op.in]: codeIds } },
      transaction,
    });
    const codeById = new Map(codes.map((item) => [item.codeItemId, item]));
    const definitionById = new Map(
      structure.attributes.map((definition) => [definition.attributeDefinitionId, definition]),
    );
    for (const value of record.attributes) {
      if (!value.codeItemId) continue;
      const definition = definitionById.get(value.attributeDefinitionId);
      if (codeById.get(value.codeItemId)?.codeListId !== definition?.codeListId) {
        throw new BusinessRuleError('Code item does not belong to the attribute code list');
      }
    }
  }
}
