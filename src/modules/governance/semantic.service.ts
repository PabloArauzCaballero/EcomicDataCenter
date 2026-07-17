import { randomUUID } from 'node:crypto';
import { Inject, Injectable } from '@nestjs/common';
import type { Sequelize } from 'sequelize';
import { chunkItems } from '../../common/bulk';
import { ConflictError, NotFoundError } from '../../common/errors/application.error';
import { WRITER_DATABASE } from '../../database/database.tokens';
import {
  ClassificationItemModel,
  ClassificationMappingModel,
  ClassificationModel,
  ClassificationVersionModel,
  CodeItemModel,
  CodeListModel,
  ConceptModel,
  FrequencyModel,
  GeographicUnitModel,
  StatisticalDomainModel,
  UnitMeasureModel,
} from '../../database/models';
import type {
  CreateClassificationInput,
  CreateClassificationMappingInput,
  CreateCodeListInput,
  CreateConceptInput,
  CreateDomainInput,
  CreateFrequencyInput,
  CreateGeographicUnitInput,
  CreateUnitMeasureInput,
} from './semantic.schemas';

const BULK_CHUNK_SIZE = 500;

@Injectable()
export class SemanticService {
  constructor(@Inject(WRITER_DATABASE) private readonly writer: Sequelize) {}

  createDomain(input: CreateDomainInput) {
    return StatisticalDomainModel.create({
      statisticalDomainId: randomUUID(),
      parentDomainId: input.parentDomainId ?? null,
      code: input.code,
      name: input.name,
      description: input.description ?? null,
      sortOrder: input.sortOrder,
      isActive: input.isActive,
    });
  }

  createConcept(input: CreateConceptInput) {
    return ConceptModel.create({
      conceptId: randomUUID(),
      ownerOrganizationId: input.ownerOrganizationId,
      code: input.code,
      name: input.name,
      definition: input.definition,
      conceptType: input.conceptType,
      validFrom: input.validFrom ?? null,
      validTo: input.validTo ?? null,
    });
  }

  createFrequency(input: CreateFrequencyInput) {
    return FrequencyModel.create({
      frequencyId: randomUUID(),
      code: input.code,
      name: input.name,
      periodsPerYear: input.periodsPerYear ?? null,
      isoDuration: input.isoDuration ?? null,
    });
  }

  createUnitMeasure(input: CreateUnitMeasureInput) {
    return UnitMeasureModel.create({
      unitMeasureId: randomUUID(),
      baseUnitMeasureId: input.baseUnitMeasureId ?? null,
      code: input.code,
      name: input.name,
      symbol: input.symbol ?? null,
      multiplierPower10: input.multiplierPower10,
      valueKind: input.valueKind,
    });
  }

  createGeographicUnit(input: CreateGeographicUnitInput) {
    return GeographicUnitModel.create({
      geographicUnitId: randomUUID(),
      parentGeographicUnitId: input.parentGeographicUnitId ?? null,
      officialCode: input.officialCode,
      name: input.name,
      geographicLevel: input.geographicLevel,
      validFrom: input.validFrom,
      validTo: input.validTo ?? null,
      geometryReference: input.geometryReference ?? null,
    });
  }

  createCodeList(input: CreateCodeListInput) {
    this.assertUniqueCodes(
      input.items.map((item) => item.code),
      'code list item',
    );
    return this.writer.transaction(async (transaction) => {
      const codeList = await CodeListModel.create(
        {
          codeListId: randomUUID(),
          ownerOrganizationId: input.ownerOrganizationId,
          code: input.code,
          name: input.name,
          versionCode: input.versionCode,
          validFrom: input.validFrom ?? null,
          validTo: input.validTo ?? null,
        },
        { transaction },
      );
      const ids = new Map(input.items.map((item) => [item.code, randomUUID()]));
      for (const item of input.items) {
        if (item.parentCode && !ids.has(item.parentCode)) {
          throw new NotFoundError('parent_code_item', item.parentCode);
        }
      }
      const rows = input.items.map((item) => ({
        codeItemId: ids.get(item.code)!,
        codeListId: codeList.codeListId,
        parentCodeItemId: item.parentCode ? ids.get(item.parentCode)! : null,
        code: item.code,
        name: item.name,
        description: item.description ?? null,
        sortOrder: item.sortOrder,
        validFrom: item.validFrom ?? null,
        validTo: item.validTo ?? null,
        isActive: item.isActive,
      }));
      for (const chunk of chunkItems(rows, BULK_CHUNK_SIZE)) {
        await CodeItemModel.bulkCreate(chunk, { transaction });
      }
      return { codeListId: codeList.codeListId, itemCount: input.items.length };
    });
  }

  createClassification(input: CreateClassificationInput) {
    this.assertUniqueCodes(
      input.version.items.map((item) => item.code),
      'classification item',
    );
    return this.writer.transaction(async (transaction) => {
      const classification = await ClassificationModel.create(
        {
          classificationId: randomUUID(),
          custodianOrganizationId: input.custodianOrganizationId,
          code: input.code,
          name: input.name,
          classificationType: input.classificationType,
        },
        { transaction },
      );
      const version = await ClassificationVersionModel.create(
        {
          classificationVersionId: randomUUID(),
          classificationId: classification.classificationId,
          versionCode: input.version.versionCode,
          name: input.version.name,
          validFrom: input.version.validFrom ?? null,
          validTo: input.version.validTo ?? null,
          publicationDate: input.version.publicationDate ?? null,
          isCurrent: input.version.isCurrent,
          methodologyUri: input.version.methodologyUri ?? null,
        },
        { transaction },
      );
      const ids = new Map(input.version.items.map((item) => [item.code, randomUUID()]));
      for (const item of input.version.items) {
        if (item.parentCode && !ids.has(item.parentCode)) {
          throw new NotFoundError('parent_classification_item', item.parentCode);
        }
      }
      const rows = input.version.items.map((item) => ({
        classificationItemId: ids.get(item.code)!,
        classificationVersionId: version.classificationVersionId,
        parentItemId: item.parentCode ? ids.get(item.parentCode)! : null,
        code: item.code,
        name: item.name,
        description: item.description ?? null,
        levelNo: item.levelNo,
        sortOrder: item.sortOrder,
        validFrom: item.validFrom ?? null,
        validTo: item.validTo ?? null,
      }));
      for (const chunk of chunkItems(rows, BULK_CHUNK_SIZE)) {
        await ClassificationItemModel.bulkCreate(chunk, { transaction });
      }
      return {
        classificationId: classification.classificationId,
        classificationVersionId: version.classificationVersionId,
        itemCount: input.version.items.length,
      };
    });
  }

  async createClassificationMapping(input: CreateClassificationMappingInput) {
    if (input.sourceItemId === input.targetItemId) {
      throw new ConflictError('A classification item cannot map to itself');
    }
    return ClassificationMappingModel.create({
      classificationMappingId: randomUUID(),
      sourceItemId: input.sourceItemId,
      targetItemId: input.targetItemId,
      equivalenceType: input.equivalenceType,
      weight: input.weight ?? null,
      validFrom: input.validFrom ?? null,
      validTo: input.validTo ?? null,
      evidenceNote: input.evidenceNote ?? null,
    });
  }

  private assertUniqueCodes(codes: readonly string[], entity: string): void {
    if (new Set(codes).size !== codes.length) {
      throw new ConflictError(`Duplicate ${entity} code in request`);
    }
  }
}
