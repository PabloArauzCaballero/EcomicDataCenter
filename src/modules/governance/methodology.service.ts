import { randomUUID } from 'node:crypto';
import { Inject, Injectable } from '@nestjs/common';
import type { Sequelize, Transaction } from 'sequelize';
import { BusinessRuleError, NotFoundError } from '../../common/errors/application.error';
import { WRITER_DATABASE } from '../../database/database.tokens';
import { MethodologyModel, MethodologyVersionModel } from '../../database/models';
import type { CreateMethodologyInput, MethodologyVersionInput } from './metadata.schemas';
import { assertMethodologyVersionTransition } from './version-transition.policy';

/** Owns methodology aggregate creation, versioning and state transitions. */
@Injectable()
export class MethodologyService {
  constructor(@Inject(WRITER_DATABASE) private readonly writer: Sequelize) {}

  create(input: CreateMethodologyInput) {
    return this.writer.transaction(async (transaction) => {
      const methodology = await MethodologyModel.create(
        {
          methodologyId: randomUUID(),
          ownerOrganizationId: input.ownerOrganizationId,
          code: input.code,
          name: input.name,
          methodologyType: input.methodologyType,
          description: input.description ?? null,
          isOfficial: input.isOfficial,
          isActive: input.isActive,
        },
        { transaction },
      );
      const version = await this.createVersionRecord(methodology.methodologyId, input.version, transaction);
      return {
        methodologyId: methodology.methodologyId,
        methodologyVersionId: version.methodologyVersionId,
      };
    });
  }

  createVersion(methodologyId: string, input: MethodologyVersionInput) {
    return this.writer.transaction(async (transaction) => {
      const methodology = await MethodologyModel.findByPk(methodologyId, {
        transaction,
        lock: transaction.LOCK.UPDATE,
      });
      if (!methodology) throw new NotFoundError('Methodology', methodologyId);
      if (!methodology.isActive) {
        throw new BusinessRuleError('A version cannot be added to an inactive methodology');
      }
      return this.createVersionRecord(methodologyId, input, transaction);
    });
  }

  transition(versionId: string, targetStatus: string) {
    return this.writer.transaction(async (transaction) => {
      const version = await MethodologyVersionModel.findByPk(versionId, {
        transaction,
        lock: transaction.LOCK.UPDATE,
      });
      if (!version) throw new NotFoundError('MethodologyVersion', versionId);
      assertMethodologyVersionTransition(version.status, targetStatus);

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
    methodologyId: string,
    input: MethodologyVersionInput,
    transaction: Transaction,
  ) {
    return MethodologyVersionModel.create(
      {
        methodologyVersionId: randomUUID(),
        methodologyId,
        versionCode: input.versionCode,
        title: input.title,
        status: input.status,
        formulaDescription: input.formulaDescription ?? null,
        universeDefinition: input.universeDefinition ?? null,
        samplingMethod: input.samplingMethod ?? null,
        missingDataTreatment: input.missingDataTreatment ?? null,
        seasonalAdjustmentMethod: input.seasonalAdjustmentMethod ?? null,
        revisionPolicy: input.revisionPolicy ?? null,
        confidentialityPolicy: input.confidentialityPolicy ?? null,
        validFrom: input.validFrom,
        validTo: input.validTo ?? null,
        publicationDate: input.publicationDate ?? null,
        documentUri: input.documentUri ?? null,
        isCurrent: false,
      },
      { transaction },
    );
  }

  private async publish(version: MethodologyVersionModel, transaction: Transaction): Promise<void> {
    if (!version.publicationDate) {
      throw new BusinessRuleError('publicationDate is required before publishing');
    }
    const current = await MethodologyVersionModel.findOne({
      where: { methodologyId: version.methodologyId, isCurrent: true },
      transaction,
      lock: transaction.LOCK.UPDATE,
    });
    if (current && current.methodologyVersionId !== version.methodologyVersionId) {
      if (current.validFrom > version.validFrom) {
        throw new BusinessRuleError('The new current version cannot start before the current version');
      }
      await current.update(
        { status: 'SUPERSEDED', isCurrent: false, validTo: version.validFrom },
        { transaction },
      );
    }
    await version.update({ status: 'PUBLISHED', isCurrent: true }, { transaction });
  }

}
