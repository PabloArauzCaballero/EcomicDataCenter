import { Injectable } from '@nestjs/common';
import type { Transaction } from 'sequelize';
import {
  LineageRelationModel,
  ObservationAttributeValueModel,
  ObservationMeasureModel,
  ObservationRevisionModel,
} from '../../database/models';
import type { ObservationRecordInput } from './observation-input.schemas';
import { mapAttributeValue, mapMeasureValue } from './observation-value.mapper';

@Injectable()
export class RevisionWriteRepository {
  current(
    observationId: string,
    transaction: Transaction,
  ): Promise<ObservationRevisionModel | null> {
    return ObservationRevisionModel.findOne({
      where: { observationId, isCurrent: true },
      transaction,
      lock: transaction.LOCK.UPDATE,
    });
  }

  async createDraft(
    values: {
      observationId: string;
      sourceArtifactId: string;
      dataEntryBatchId: string;
      revisionNumber: number;
      normalizedHash: string;
      record: ObservationRecordInput;
    },
    transaction: Transaction,
  ): Promise<ObservationRevisionModel> {
    const revision = await ObservationRevisionModel.create(
      {
        observationId: values.observationId,
        sourceArtifactId: values.sourceArtifactId,
        dataEntryBatchId: values.dataEntryBatchId,
        revisionNumber: values.revisionNumber,
        status: 'DRAFT',
        confidentialityStatus: values.record.confidentialityStatus,
        publicationDate: values.record.publicationDate ?? null,
        captureDate: new Date(),
        vintageDate: values.record.vintageDate,
        validFrom: new Date(),
        validTo: null,
        isCurrent: false,
        revisionReason: values.record.revisionReason ?? null,
        normalizedHash: values.normalizedHash,
      },
      { transaction },
    );
    await ObservationMeasureModel.bulkCreate(
      values.record.measures.map((value) => mapMeasureValue(revision.observationRevisionId, value)),
      { transaction },
    );
    await ObservationAttributeValueModel.bulkCreate(
      values.record.attributes.map((value) =>
        mapAttributeValue(revision.observationRevisionId, value),
      ),
      { transaction },
    );
    return revision;
  }

  async publish(
    revision: ObservationRevisionModel,
    previous: ObservationRevisionModel | null,
    transaction: Transaction,
  ): Promise<void> {
    const now = new Date();
    if (previous) {
      await previous.update(
        { isCurrent: false, status: 'SUPERSEDED', validTo: now },
        { transaction },
      );
    }
    await revision.update(
      { isCurrent: true, status: 'PUBLISHED', validFrom: now },
      { transaction },
    );
    if (!previous) return;
    await LineageRelationModel.create(
      {
        methodologyVersionId: null,
        sourceEntityType: 'OBSERVATION_REVISION',
        sourceEntityId: previous.observationRevisionId,
        targetEntityType: 'OBSERVATION_REVISION',
        targetEntityId: revision.observationRevisionId,
        relationType: 'REVISED_FROM',
        transformationDescription: revision.revisionReason,
        formula: null,
        createdAt: now,
      },
      { transaction },
    );
  }
}
