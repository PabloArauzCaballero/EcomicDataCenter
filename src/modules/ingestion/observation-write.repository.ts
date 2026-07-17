import { Injectable } from '@nestjs/common';
import type { Transaction } from 'sequelize';
import { BusinessRuleError, NotFoundError } from '../../common/errors/application.error';
import {
  DataEntryBatchModel,
  DatasetModel,
  DatasetVersionModel,
  ObservationModel,
  OrganizationModel,
  SeriesDimensionValueModel,
  SeriesModel,
  SourceArtifactModel,
  SourceModel,
} from '../../database/models';
import type { DimensionValueInput, ObservationRecordInput } from './observation-input.schemas';
import { mapDimensionValue } from './observation-value.mapper';

interface BatchClaimInput {
  datasetVersionId: string;
  sourceArtifactId: string;
  submittedByOrganizationId: string;
  batchCode: string;
  entryMethod: string;
  requestFingerprint: string;
  receivedCount: number;
  notes?: string;
}

@Injectable()
export class ObservationWriteRepository {
  async assertProvenance(
    datasetVersionId: string,
    sourceArtifactId: string,
    organizationId: string,
    transaction: Transaction,
  ): Promise<void> {
    const [artifact, organization, datasetVersion] = await Promise.all([
      SourceArtifactModel.findByPk(sourceArtifactId, { transaction }),
      OrganizationModel.findByPk(organizationId, { transaction }),
      DatasetVersionModel.findByPk(datasetVersionId, { transaction }),
    ]);
    if (!artifact) throw new NotFoundError('source_artifact', sourceArtifactId);
    if (!organization) throw new NotFoundError('organization', organizationId);
    if (!datasetVersion) throw new NotFoundError('dataset_version', datasetVersionId);

    const [source, dataset] = await Promise.all([
      SourceModel.findByPk(artifact.sourceId, { transaction }),
      DatasetModel.findByPk(datasetVersion.datasetId, { transaction }),
    ]);
    if (!source) throw new NotFoundError('source', artifact.sourceId);
    if (!dataset) throw new NotFoundError('dataset', datasetVersion.datasetId);
    if (source.organizationId !== organizationId) {
      throw new BusinessRuleError('The submitting organization does not own the source artifact');
    }
    if (dataset.sourceId !== source.sourceId) {
      throw new BusinessRuleError('The source artifact does not belong to the dataset source');
    }
  }

  async claimBatch(
    values: BatchClaimInput,
    transaction: Transaction,
  ): Promise<{ batch: DataEntryBatchModel; claimed: boolean }> {
    const [batch, claimed] = await DataEntryBatchModel.findOrCreate({
      where: { batchCode: values.batchCode },
      defaults: {
        datasetVersionId: values.datasetVersionId,
        sourceArtifactId: values.sourceArtifactId,
        submittedByOrganizationId: values.submittedByOrganizationId,
        batchCode: values.batchCode,
        entryMethod: values.entryMethod,
        status: 'VALIDATING',
        receivedCount: String(values.receivedCount),
        acceptedCount: '0',
        rejectedCount: '0',
        submittedAt: new Date(),
        startedAt: new Date(),
        completedAt: null,
        requestFingerprint: values.requestFingerprint,
        resultJson: null,
        notes: values.notes ?? null,
      },
      transaction,
    });
    if (!claimed) await batch.reload({ transaction, lock: transaction.LOCK.UPDATE });
    return { batch, claimed };
  }

  async resolveSeries(
    values: {
      datasetVersionId: string;
      indicatorVersionId?: string;
      frequencyId: string;
      unitMeasureId?: string;
      seriesKey: string;
      seriesKeyHash: string;
      dimensions: readonly DimensionValueInput[];
    },
    transaction: Transaction,
  ): Promise<SeriesModel> {
    const [series, created] = await SeriesModel.findOrCreate({
      where: { datasetVersionId: values.datasetVersionId, seriesKeyHash: values.seriesKeyHash },
      defaults: {
        datasetVersionId: values.datasetVersionId,
        indicatorVersionId: values.indicatorVersionId ?? null,
        frequencyId: values.frequencyId,
        unitMeasureId: values.unitMeasureId ?? null,
        seriesKey: values.seriesKey,
        seriesKeyHash: values.seriesKeyHash,
        status: 'ACTIVE',
        validFrom: null,
        validTo: null,
      },
      transaction,
    });
    if (created) {
      await SeriesDimensionValueModel.bulkCreate(
        values.dimensions.map((value) => mapDimensionValue(series.seriesId, value)),
        { transaction },
      );
      return series;
    }
    this.assertCompatibleSeries(series, values);
    return series;
  }

  async resolveObservation(
    seriesId: string,
    record: ObservationRecordInput,
    transaction: Transaction,
  ): Promise<ObservationModel> {
    const [observation] = await ObservationModel.findOrCreate({
      where: { seriesId, periodStart: record.periodStart, periodEnd: record.periodEnd },
      defaults: {
        seriesId,
        periodStart: record.periodStart,
        periodEnd: record.periodEnd,
        periodCode: record.periodCode,
        referenceDate: record.referenceDate ?? null,
      },
      transaction,
    });
    await observation.reload({ transaction, lock: transaction.LOCK.UPDATE });
    if (
      observation.periodCode !== record.periodCode ||
      observation.referenceDate !== (record.referenceDate ?? null)
    ) {
      throw new BusinessRuleError('Observation period conflicts with the existing observation', {
        observationId: observation.observationId,
      });
    }
    return observation;
  }

  private assertCompatibleSeries(
    series: SeriesModel,
    values: {
      indicatorVersionId?: string;
      frequencyId: string;
      unitMeasureId?: string;
      seriesKey: string;
    },
  ): void {
    if (
      series.indicatorVersionId !== (values.indicatorVersionId ?? null) ||
      series.frequencyId !== values.frequencyId ||
      series.unitMeasureId !== (values.unitMeasureId ?? null) ||
      series.seriesKey !== values.seriesKey
    ) {
      throw new BusinessRuleError('Series identity conflicts with existing series metadata', {
        seriesId: series.seriesId,
      });
    }
  }
}
