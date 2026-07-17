import type { Transaction } from 'sequelize';
import {
  DataStructureModel,
  DatasetIndicatorModel,
  DatasetModel,
  DatasetVersionModel,
  DimensionDefinitionModel,
  IndicatorModel,
  IndicatorVersionModel,
  MeasureDefinitionModel,
  MethodologyModel,
  MethodologyVersionModel,
} from '../../models';
import { MOCK_IDS, SYNTHETIC_INDEX_UNIT_ID } from '../seed-identifiers';
import type { MockSeed } from '../schemas/seed.schemas';

/** Reconciles the deterministic synthetic methodology, structure, dataset and indicator. */
export async function reconcileMockMetadata(
  seed: MockSeed,
  transaction: Transaction,
): Promise<void> {
  const dimensionConcept = seed.concepts[0];
  const measureConcept = seed.concepts[1];
  if (!dimensionConcept || !measureConcept) {
    throw new Error('Mock seed requires two concepts');
  }

  await reconcileMethodology(seed, transaction);
  await reconcileStructure(seed, dimensionConcept.conceptId, measureConcept.conceptId, transaction);
  await reconcileDataset(seed, transaction);
  await reconcileIndicator(seed, transaction);
}

async function reconcileMethodology(seed: MockSeed, transaction: Transaction): Promise<void> {
  await MethodologyModel.upsert(
    {
      methodologyId: seed.methodology.methodologyId,
      ownerOrganizationId: seed.organization.organizationId,
      code: seed.methodology.code,
      name: seed.methodology.name,
      methodologyType: seed.methodology.methodologyType,
      description: 'Synthetic methodology for integration tests.',
      isOfficial: false,
      isActive: true,
    },
    { transaction },
  );
  await MethodologyVersionModel.upsert(
    {
      methodologyVersionId: seed.methodology.methodologyVersionId,
      methodologyId: seed.methodology.methodologyId,
      versionCode: seed.methodology.versionCode,
      title: seed.methodology.title,
      status: 'PUBLISHED',
      formulaDescription: 'Synthetic value copied without transformation.',
      universeDefinition: null,
      samplingMethod: null,
      missingDataTreatment: null,
      seasonalAdjustmentMethod: null,
      revisionPolicy: 'Synthetic revisions replace the current value.',
      confidentialityPolicy: 'Public synthetic data only.',
      validFrom: seed.methodology.validFrom,
      validTo: null,
      publicationDate: seed.methodology.publicationDate,
      documentUri: null,
      isCurrent: true,
    },
    { transaction },
  );
}

async function reconcileStructure(
  seed: MockSeed,
  dimensionConceptId: string,
  measureConceptId: string,
  transaction: Transaction,
): Promise<void> {
  await DataStructureModel.upsert(
    {
      dataStructureId: seed.structure.dataStructureId,
      ownerOrganizationId: seed.organization.organizationId,
      code: seed.structure.code,
      name: seed.structure.name,
      versionCode: seed.structure.versionCode,
      validFrom: seed.dataset.validFrom,
      validTo: null,
      isActive: true,
    },
    { transaction },
  );
  await DimensionDefinitionModel.upsert(
    {
      dimensionDefinitionId: seed.structure.dimensionDefinitionId,
      dataStructureId: seed.structure.dataStructureId,
      conceptId: dimensionConceptId,
      codeListId: seed.codeList.codeListId,
      classificationVersionId: null,
      code: 'GEO',
      role: 'IDENTIFIER',
      positionNo: 1,
      attachmentLevel: 'SERIES',
      representationKind: 'CODE_LIST',
      isRequired: true,
      isTimeDimension: false,
    },
    { transaction },
  );
  await MeasureDefinitionModel.upsert(
    {
      measureDefinitionId: seed.structure.measureDefinitionId,
      dataStructureId: seed.structure.dataStructureId,
      conceptId: measureConceptId,
      unitMeasureId: SYNTHETIC_INDEX_UNIT_ID,
      code: 'OBS_VALUE',
      name: 'Synthetic index value',
      dataType: 'NUMERIC',
      precisionScale: 4,
      isPrimaryMeasure: true,
    },
    { transaction },
  );
}

async function reconcileDataset(seed: MockSeed, transaction: Transaction): Promise<void> {
  await DatasetModel.upsert(
    {
      datasetId: seed.dataset.datasetId,
      statisticalOperationId: null,
      sourceId: seed.source.sourceId,
      producerOrganizationId: seed.organization.organizationId,
      statisticalDomainId: seed.domain.statisticalDomainId,
      code: seed.dataset.code,
      name: seed.dataset.name,
      description: 'Synthetic dataset. Never use in production.',
      dataNature: 'EXPERIMENTAL',
      publicationStatus: 'PUBLISHED',
      licenseCode: 'SYNTHETIC-ONLY',
      confidentialityLevel: 'PUBLIC',
    },
    { transaction },
  );
  await DatasetVersionModel.upsert(
    {
      datasetVersionId: seed.dataset.datasetVersionId,
      datasetId: seed.dataset.datasetId,
      methodologyVersionId: seed.methodology.methodologyVersionId,
      dataStructureId: seed.structure.dataStructureId,
      versionCode: seed.dataset.versionCode,
      title: seed.dataset.title,
      status: 'PUBLISHED',
      referenceBasePeriod: '2026',
      validFrom: seed.dataset.validFrom,
      validTo: null,
      publicationDate: seed.dataset.publicationDate,
      isCurrent: true,
      changeReason: 'Initial synthetic version.',
    },
    { transaction },
  );
}

async function reconcileIndicator(seed: MockSeed, transaction: Transaction): Promise<void> {
  await IndicatorModel.upsert(
    {
      indicatorId: seed.indicator.indicatorId,
      statisticalDomainId: seed.domain.statisticalDomainId,
      ownerOrganizationId: seed.organization.organizationId,
      code: seed.indicator.code,
      name: seed.indicator.name,
      shortName: seed.indicator.name,
      definition: seed.indicator.definition,
      indicatorType: 'INDEX',
      dataNature: 'EXPERIMENTAL',
      preferredDirection: null,
      isActive: true,
    },
    { transaction },
  );
  await IndicatorVersionModel.upsert(
    {
      indicatorVersionId: seed.indicator.indicatorVersionId,
      indicatorId: seed.indicator.indicatorId,
      methodologyVersionId: seed.methodology.methodologyVersionId,
      unitMeasureId: SYNTHETIC_INDEX_UNIT_ID,
      frequencyId: seed.source.frequencyId,
      versionNumber: 1,
      definition: seed.indicator.definition,
      calculationFormula: null,
      validFrom: seed.dataset.validFrom,
      validTo: null,
      changeReason: 'Initial synthetic version.',
    },
    { transaction },
  );
  await DatasetIndicatorModel.upsert(
    {
      datasetIndicatorId: MOCK_IDS.datasetIndicator,
      datasetVersionId: seed.dataset.datasetVersionId,
      indicatorVersionId: seed.indicator.indicatorVersionId,
      isPrimary: true,
      sortOrder: 1,
    },
    { transaction },
  );
}
