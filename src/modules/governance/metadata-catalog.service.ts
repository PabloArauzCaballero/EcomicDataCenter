import { randomUUID } from 'node:crypto';
import { Inject, Injectable } from '@nestjs/common';
import type { Sequelize } from 'sequelize';
import { WRITER_DATABASE } from '../../database/database.tokens';
import {
  AttributeDefinitionModel,
  DataStructureModel,
  DatasetIndicatorModel,
  DimensionDefinitionModel,
  IndicatorModel,
  IndicatorVersionModel,
  MeasureDefinitionModel,
  StatisticalOperationModel,
} from '../../database/models';
import type {
  CreateDataStructureInput,
  CreateIndicatorInput,
  CreateStatisticalOperationInput,
} from './metadata.schemas';

/** Creates metadata aggregates that do not own lifecycle transitions. */
@Injectable()
export class MetadataCatalogService {
  constructor(@Inject(WRITER_DATABASE) private readonly writer: Sequelize) {}

  createStatisticalOperation(input: CreateStatisticalOperationInput) {
    return StatisticalOperationModel.create({
      statisticalOperationId: randomUUID(),
      producerOrganizationId: input.producerOrganizationId,
      code: input.code,
      name: input.name,
      operationType: input.operationType,
      objective: input.objective,
      populationScope: input.populationScope ?? null,
      geographicScope: input.geographicScope ?? null,
      collectionMethod: input.collectionMethod ?? null,
      startDate: input.startDate ?? null,
      endDate: input.endDate ?? null,
      status: input.status,
    });
  }

  createDataStructure(input: CreateDataStructureInput) {
    return this.writer.transaction(async (transaction) => {
      const structure = await DataStructureModel.create(
        {
          dataStructureId: randomUUID(),
          ownerOrganizationId: input.ownerOrganizationId,
          code: input.code,
          name: input.name,
          versionCode: input.versionCode,
          validFrom: input.validFrom ?? null,
          validTo: input.validTo ?? null,
          isActive: input.isActive,
        },
        { transaction },
      );

      await DimensionDefinitionModel.bulkCreate(
        input.dimensions.map((item) => ({
          dimensionDefinitionId: randomUUID(),
          dataStructureId: structure.dataStructureId,
          conceptId: item.conceptId,
          codeListId: item.codeListId ?? null,
          classificationVersionId: item.classificationVersionId ?? null,
          code: item.code,
          role: item.role,
          positionNo: item.positionNo,
          attachmentLevel: item.attachmentLevel,
          representationKind: item.representationKind,
          isRequired: item.isRequired,
          isTimeDimension: item.isTimeDimension,
        })),
        { transaction },
      );
      await MeasureDefinitionModel.bulkCreate(
        input.measures.map((item) => ({
          measureDefinitionId: randomUUID(),
          dataStructureId: structure.dataStructureId,
          conceptId: item.conceptId,
          unitMeasureId: item.unitMeasureId ?? null,
          code: item.code,
          name: item.name,
          dataType: item.dataType,
          precisionScale: item.precisionScale ?? null,
          isPrimaryMeasure: item.isPrimaryMeasure,
        })),
        { transaction },
      );
      await AttributeDefinitionModel.bulkCreate(
        input.attributes.map((item) => ({
          attributeDefinitionId: randomUUID(),
          dataStructureId: structure.dataStructureId,
          conceptId: item.conceptId,
          codeListId: item.codeListId ?? null,
          code: item.code,
          name: item.name,
          dataType: item.dataType,
          attachmentLevel: item.attachmentLevel,
          isRequired: item.isRequired,
        })),
        { transaction },
      );

      return {
        dataStructureId: structure.dataStructureId,
        dimensions: input.dimensions.length,
        measures: input.measures.length,
        attributes: input.attributes.length,
      };
    });
  }

  createIndicator(input: CreateIndicatorInput) {
    return this.writer.transaction(async (transaction) => {
      const indicator = await IndicatorModel.create(
        {
          indicatorId: randomUUID(),
          statisticalDomainId: input.statisticalDomainId,
          ownerOrganizationId: input.ownerOrganizationId,
          code: input.code,
          name: input.name,
          shortName: input.shortName ?? null,
          definition: input.definition,
          indicatorType: input.indicatorType,
          dataNature: input.dataNature,
          preferredDirection: input.preferredDirection ?? null,
          isActive: input.isActive,
        },
        { transaction },
      );
      const version = await IndicatorVersionModel.create(
        {
          indicatorVersionId: randomUUID(),
          indicatorId: indicator.indicatorId,
          methodologyVersionId: input.version.methodologyVersionId ?? null,
          unitMeasureId: input.version.unitMeasureId,
          frequencyId: input.version.frequencyId,
          versionNumber: input.version.versionNumber,
          definition: input.version.definition,
          calculationFormula: input.version.calculationFormula ?? null,
          validFrom: input.version.validFrom,
          validTo: input.version.validTo ?? null,
          changeReason: input.version.changeReason ?? null,
        },
        { transaction },
      );

      if (input.version.datasetVersionId) {
        await DatasetIndicatorModel.create(
          {
            datasetIndicatorId: randomUUID(),
            datasetVersionId: input.version.datasetVersionId,
            indicatorVersionId: version.indicatorVersionId,
            isPrimary: input.version.isPrimaryInDataset,
            sortOrder: input.version.sortOrder,
          },
          { transaction },
        );
      }

      return {
        indicatorId: indicator.indicatorId,
        indicatorVersionId: version.indicatorVersionId,
      };
    });
  }
}
