import { ForbiddenException, Inject, Injectable } from '@nestjs/common';
import type { Sequelize, Transaction } from 'sequelize';
import type { Actor } from '../../common/auth/actor';
import { MetricsService } from '../../common/observability/metrics.service';
import { withSerializableRetry } from '../../common/persistence.transaction';
import { WRITER_DATABASE } from '../../database/database.tokens';
import { manualRequestFingerprint, replayRegistration } from './batch-idempotency';
import type { RegistrationResult } from './ingestion-results';
import { buildRevisionHash, buildSeriesIdentity } from './observation-normalizer';
import type {
  ObservationRecordInput,
  RegisterObservationInput,
} from './observation-input.schemas';
import { ObservationWriteRepository } from './observation-write.repository';
import { QualityEvaluatorService } from './quality-evaluator.service';
import { RevisionWriteRepository } from './revision-write.repository';
import { StructureRepository } from './structure.repository';
import { validateRecordAgainstStructure } from './structure-validator';

interface RegisterWithinBatchInput {
  datasetVersionId: string;
  sourceArtifactId: string;
  dataEntryBatchId: string;
  record: ObservationRecordInput;
}

type RegistrationWithoutBatch = Omit<RegistrationResult, 'batchId'>;

@Injectable()
export class ObservationRegistrationService {
  constructor(
    @Inject(WRITER_DATABASE) private readonly writer: Sequelize,
    private readonly structures: StructureRepository,
    private readonly writes: ObservationWriteRepository,
    private readonly revisions: RevisionWriteRepository,
    private readonly quality: QualityEvaluatorService,
    private readonly metrics: MetricsService,
  ) {}

  /** Registers one observation with durable batch-code idempotency. */
  register(input: RegisterObservationInput, actor: Actor): Promise<RegistrationResult> {
    this.assertActorOrganization(actor, input.submittedByOrganizationId);
    const requestFingerprint = manualRequestFingerprint(input);

    return withSerializableRetry(this.writer, async (transaction) => {
      await this.writes.assertProvenance(
        input.datasetVersionId,
        input.sourceArtifactId,
        input.submittedByOrganizationId,
        transaction,
      );
      const { batch, claimed } = await this.writes.claimBatch(
        {
          datasetVersionId: input.datasetVersionId,
          sourceArtifactId: input.sourceArtifactId,
          submittedByOrganizationId: input.submittedByOrganizationId,
          batchCode: input.batchCode,
          entryMethod: 'MANUAL',
          requestFingerprint,
          receivedCount: 1,
        },
        transaction,
      );
      if (!claimed) return replayRegistration(batch, requestFingerprint);

      const registration = await this.registerWithinBatch(
        {
          datasetVersionId: input.datasetVersionId,
          sourceArtifactId: input.sourceArtifactId,
          dataEntryBatchId: batch.dataEntryBatchId,
          record: input.record,
        },
        transaction,
      );
      const accepted = registration.status !== 'REJECTED';
      const result: RegistrationResult = {
        ...registration,
        batchId: batch.dataEntryBatchId,
      };
      await batch.update(
        {
          status: accepted ? 'COMMITTED' : 'REJECTED',
          acceptedCount: accepted ? '1' : '0',
          rejectedCount: accepted ? '0' : '1',
          completedAt: new Date(),
          resultJson: { ...result },
        },
        { transaction },
      );
      return result;
    }).then((result) => {
      this.metrics.observeIngestion('single', result.status);
      return result;
    });
  }

  /** Registers a record inside an already claimed batch transaction. */
  async registerWithinBatch(
    input: RegisterWithinBatchInput,
    transaction: Transaction,
  ): Promise<RegistrationWithoutBatch> {
    const structure = await this.structures.loadPublishedDatasetVersion(
      input.datasetVersionId,
      transaction,
    );
    validateRecordAgainstStructure(input.record, structure);
    await this.structures.assertReferencedValues(input.record, structure, transaction);

    const definitionById = new Map(
      structure.dimensions.map((definition) => [definition.dimensionDefinitionId, definition]),
    );
    const orderedDimensions = input.record.dimensions.map((dimension) => {
      const definition = definitionById.get(dimension.dimensionDefinitionId);
      if (!definition) throw new Error('Validated dimension definition is missing');
      return { ...dimension, code: definition.code, position: definition.positionNo };
    });
    const identity = buildSeriesIdentity(orderedDimensions);
    const series = await this.writes.resolveSeries(
      {
        datasetVersionId: input.datasetVersionId,
        ...(input.record.indicatorVersionId
          ? { indicatorVersionId: input.record.indicatorVersionId }
          : {}),
        frequencyId: input.record.frequencyId,
        ...(input.record.unitMeasureId ? { unitMeasureId: input.record.unitMeasureId } : {}),
        ...identity,
        dimensions: input.record.dimensions,
      },
      transaction,
    );
    const observation = await this.writes.resolveObservation(
      series.seriesId,
      input.record,
      transaction,
    );
    const current = await this.revisions.current(observation.observationId, transaction);
    const normalizedHash = buildRevisionHash(input.record);
    if (current?.normalizedHash === normalizedHash) {
      return {
        status: 'UNCHANGED',
        seriesId: series.seriesId,
        observationId: observation.observationId,
        observationRevisionId: current.observationRevisionId,
        revisionNumber: current.revisionNumber,
        qualityIssueIds: [],
      };
    }

    const revision = await this.revisions.createDraft(
      {
        observationId: observation.observationId,
        sourceArtifactId: input.sourceArtifactId,
        dataEntryBatchId: input.dataEntryBatchId,
        revisionNumber: (current?.revisionNumber ?? 0) + 1,
        normalizedHash,
        record: input.record,
      },
      transaction,
    );
    const evaluation = await this.quality.evaluateRevision(
      revision.observationRevisionId,
      input.dataEntryBatchId,
      input.record,
      transaction,
    );
    if (evaluation.criticalFailure) {
      await revision.update({ status: 'REJECTED' }, { transaction });
      return {
        status: 'REJECTED',
        seriesId: series.seriesId,
        observationId: observation.observationId,
        observationRevisionId: revision.observationRevisionId,
        revisionNumber: revision.revisionNumber,
        qualityIssueIds: [...evaluation.issueIds],
      };
    }

    await revision.update({ status: 'VALIDATED' }, { transaction });
    await this.revisions.publish(revision, current, transaction);
    return {
      status: 'PUBLISHED',
      seriesId: series.seriesId,
      observationId: observation.observationId,
      observationRevisionId: revision.observationRevisionId,
      revisionNumber: revision.revisionNumber,
      qualityIssueIds: [...evaluation.issueIds],
    };
  }

  private assertActorOrganization(actor: Actor, submittedByOrganizationId: string): void {
    if (actor.organizationId && actor.organizationId !== submittedByOrganizationId) {
      throw new ForbiddenException('Actor cannot submit data for another organization');
    }
  }
}
