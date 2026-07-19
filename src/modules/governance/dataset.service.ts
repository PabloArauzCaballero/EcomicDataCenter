import { randomUUID } from 'node:crypto';
import { Inject, Injectable } from '@nestjs/common';
import type { Sequelize, Transaction } from 'sequelize';
import { BusinessRuleError, NotFoundError } from '../../common/errors/application.error';
import { WRITER_DATABASE } from '../../database/database.tokens';
import {
  DataStructureModel,
  DatasetModel,
  DatasetVersionModel,
  MethodologyVersionModel,
} from '../../database/models';
import type { CreateDatasetInput, DatasetVersionInput } from './metadata.schemas';
import { assertDatasetVersionTransition } from './version-transition.policy';

/** Owns dataset aggregate creation, versioning and publication invariants. */
@Injectable()
export class DatasetService {
  constructor(@Inject(WRITER_DATABASE) private readonly writer: Sequelize) {}

  create(input: CreateDatasetInput) {
    return this.writer.transaction(async (transaction) => {
      const dataset = await DatasetModel.create(
        {
          datasetId: randomUUID(),
          statisticalOperationId: input.statisticalOperationId ?? null,
          sourceId: input.sourceId,
          producerOrganizationId: input.producerOrganizationId,
          statisticalDomainId: input.statisticalDomainId,
          code: input.code,
          name: input.name,
          description: input.description ?? null,
          dataNature: input.dataNature,
          publicationStatus: input.publicationStatus,
          licenseCode: input.licenseCode ?? null,
          confidentialityLevel: input.confidentialityLevel,
        },
        { transaction },
      );
      const version = await this.createVersionRecord(dataset.datasetId, input.version, transaction);
      return { datasetId: dataset.datasetId, datasetVersionId: version.datasetVersionId };
    });
  }

  createVersion(datasetId: string, input: DatasetVersionInput) {
    return this.writer.transaction(async (transaction) => {
      const dataset = await DatasetModel.findByPk(datasetId, {
        transaction,
        lock: transaction.LOCK.UPDATE,
      });
      if (!dataset) throw new NotFoundError('Dataset', datasetId);
      return this.createVersionRecord(datasetId, input, transaction);
    });
  }

  transition(versionId: string, targetStatus: string) {
    return this.writer.transaction(async (transaction) => {
      const version = await DatasetVersionModel.findByPk(versionId, {
        transaction,
        lock: transaction.LOCK.UPDATE,
      });
      if (!version) throw new NotFoundError('DatasetVersion', versionId);
      assertDatasetVersionTransition(version.status, targetStatus);

      if (targetStatus === 'PUBLISHED') {
        await this.publish(version, transaction);
      } else {
        await version.update(
          {
            status: targetStatus,
            ...(['SUPERSEDED', 'WITHDRAWN'].includes(targetStatus) ? { isCurrent: false } : {}),
          },
          { transaction },
        );
      }
      return version;
    });
  }

  private createVersionRecord(
    datasetId: string,
    input: DatasetVersionInput,
    transaction: Transaction,
  ) {
    return DatasetVersionModel.create(
      {
        datasetVersionId: randomUUID(),
        datasetId,
        methodologyVersionId: input.methodologyVersionId,
        dataStructureId: input.dataStructureId,
        versionCode: input.versionCode,
        title: input.title,
        status: input.status,
        referenceBasePeriod: input.referenceBasePeriod ?? null,
        validFrom: input.validFrom,
        validTo: input.validTo ?? null,
        publicationDate: input.publicationDate ?? null,
        isCurrent: false,
        changeReason: input.changeReason ?? null,
      },
      { transaction },
    );
  }

  private async publish(version: DatasetVersionModel, transaction: Transaction): Promise<void> {
    if (!version.publicationDate) {
      throw new BusinessRuleError('publicationDate is required before publishing');
    }
    await this.assertPublicationDependencies(version, transaction);
    const current = await DatasetVersionModel.findOne({
      where: { datasetId: version.datasetId, isCurrent: true },
      transaction,
      lock: transaction.LOCK.UPDATE,
    });
    if (current && current.datasetVersionId !== version.datasetVersionId) {
      if (current.validFrom > version.validFrom) {
        throw new BusinessRuleError(
          'The new current version cannot start before the current version',
        );
      }
      await current.update(
        { status: 'SUPERSEDED', isCurrent: false, validTo: version.validFrom },
        { transaction },
      );
    }
    await version.update({ status: 'PUBLISHED', isCurrent: true }, { transaction });
    await DatasetModel.update(
      { publicationStatus: 'PUBLISHED' },
      { where: { datasetId: version.datasetId }, transaction },
    );
  }

  private async assertPublicationDependencies(
    version: DatasetVersionModel,
    transaction: Transaction,
  ): Promise<void> {
    const [methodology, structure] = await Promise.all([
      MethodologyVersionModel.findByPk(version.methodologyVersionId, { transaction }),
      DataStructureModel.findByPk(version.dataStructureId, { transaction }),
    ]);
    if (!methodology || methodology.status !== 'PUBLISHED') {
      throw new BusinessRuleError('Dataset publication requires a published methodology version');
    }
    if (!structure?.isActive) {
      throw new BusinessRuleError('Dataset publication requires an active data structure');
    }
  }
}
