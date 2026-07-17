import { z } from 'zod';

const uuid = z.string().uuid();
const date = z.iso.date();

export const createStatisticalOperationSchema = z.object({
  producerOrganizationId: uuid,
  code: z.string().min(1).max(80),
  name: z.string().min(2).max(250),
  operationType: z.string().min(2).max(40),
  objective: z.string().min(2).max(20_000),
  populationScope: z.string().max(10_000).optional(),
  geographicScope: z.string().max(10_000).optional(),
  collectionMethod: z.string().max(10_000).optional(),
  startDate: date.optional(),
  endDate: date.optional(),
  status: z.string().min(2).max(30),
});

export const methodologyVersionInputSchema = z.object({
  versionCode: z.string().min(1).max(40),
  title: z.string().min(2).max(300),
  status: z.enum(['DRAFT', 'TECHNICAL_REVIEW', 'METHODOLOGICAL_REVIEW', 'APPROVED']),
  formulaDescription: z.string().max(20_000).optional(),
  universeDefinition: z.string().max(20_000).optional(),
  samplingMethod: z.string().max(20_000).optional(),
  missingDataTreatment: z.string().max(20_000).optional(),
  seasonalAdjustmentMethod: z.string().max(20_000).optional(),
  revisionPolicy: z.string().max(20_000).optional(),
  confidentialityPolicy: z.string().max(20_000).optional(),
  validFrom: date,
  validTo: date.optional(),
  publicationDate: date.optional(),
  documentUri: z.string().url().optional(),
});

export const createMethodologySchema = z.object({
  ownerOrganizationId: uuid,
  code: z.string().min(1).max(80),
  name: z.string().min(2).max(250),
  methodologyType: z.string().min(2).max(40),
  description: z.string().max(10_000).optional(),
  isOfficial: z.boolean(),
  isActive: z.boolean().default(true),
  version: methodologyVersionInputSchema,
});

const dimensionSchema = z
  .object({
    conceptId: uuid,
    codeListId: uuid.optional(),
    classificationVersionId: uuid.optional(),
    code: z.string().min(1).max(80),
    role: z.string().min(2).max(30),
    positionNo: z.number().int().positive(),
    attachmentLevel: z.string().min(2).max(20),
    representationKind: z.enum(['CODE_LIST', 'CLASSIFICATION', 'GEOGRAPHY', 'TEXT', 'NUMERIC', 'DATE']),
    isRequired: z.boolean(),
    isTimeDimension: z.boolean().default(false),
  })
  .superRefine((value, context) => {
    if (value.representationKind === 'CODE_LIST' && !value.codeListId) {
      context.addIssue({ code: 'custom', path: ['codeListId'], message: 'codeListId is required' });
    }
    if (value.representationKind === 'CLASSIFICATION' && !value.classificationVersionId) {
      context.addIssue({
        code: 'custom',
        path: ['classificationVersionId'],
        message: 'classificationVersionId is required',
      });
    }
    if (value.codeListId && value.classificationVersionId) {
      context.addIssue({ code: 'custom', message: 'A dimension cannot use both code list and classification' });
    }
  });

const measureSchema = z.object({
  conceptId: uuid,
  unitMeasureId: uuid.optional(),
  code: z.string().min(1).max(80),
  name: z.string().min(2).max(180),
  dataType: z.enum(['NUMERIC', 'TEXT', 'BOOLEAN']),
  precisionScale: z.number().int().min(0).max(12).optional(),
  isPrimaryMeasure: z.boolean().default(false),
});

const attributeSchema = z.object({
  conceptId: uuid,
  codeListId: uuid.optional(),
  code: z.string().min(1).max(80),
  name: z.string().min(2).max(180),
  dataType: z.enum(['CODE', 'NUMERIC', 'TEXT', 'BOOLEAN']),
  attachmentLevel: z.string().min(2).max(20),
  isRequired: z.boolean().default(false),
});

export const createDataStructureSchema = z
  .object({
    ownerOrganizationId: uuid,
    code: z.string().min(1).max(80),
    name: z.string().min(2).max(250),
    versionCode: z.string().min(1).max(40),
    validFrom: date.optional(),
    validTo: date.optional(),
    isActive: z.boolean().default(true),
    dimensions: z.array(dimensionSchema).min(1).max(100),
    measures: z.array(measureSchema).min(1).max(100),
    attributes: z.array(attributeSchema).max(100).default([]),
  })
  .superRefine((value, context) => {
    const unique = (values: readonly (string | number)[], path: string): void => {
      if (new Set(values).size !== values.length) {
        context.addIssue({ code: 'custom', path: [path], message: `Duplicate ${path}` });
      }
    };
    unique(value.dimensions.map((item) => item.code), 'dimensions');
    unique(value.dimensions.map((item) => item.positionNo), 'dimensions');
    unique(value.measures.map((item) => item.code), 'measures');
    unique(value.attributes.map((item) => item.code), 'attributes');
    if (value.dimensions.filter((item) => item.isTimeDimension).length > 1) {
      context.addIssue({ code: 'custom', path: ['dimensions'], message: 'Only one time dimension is allowed' });
    }
  });

export const datasetVersionInputSchema = z.object({
  methodologyVersionId: uuid,
  dataStructureId: uuid,
  versionCode: z.string().min(1).max(40),
  title: z.string().min(2).max(300),
  status: z.enum(['DRAFT', 'UNDER_REVIEW', 'APPROVED']),
  referenceBasePeriod: z.string().max(40).optional(),
  validFrom: date,
  validTo: date.optional(),
  publicationDate: date.optional(),
  changeReason: z.string().max(10_000).optional(),
});

export const createDatasetSchema = z.object({
  statisticalOperationId: uuid.optional(),
  sourceId: uuid,
  producerOrganizationId: uuid,
  statisticalDomainId: uuid,
  code: z.string().min(1).max(80),
  name: z.string().min(2).max(300),
  description: z.string().max(20_000).optional(),
  dataNature: z.enum([
    'OFFICIAL_STATISTIC',
    'ADMINISTRATIVE_RECORD',
    'OFFICIAL_EXTERNAL',
    'OBSERVATORY_DERIVED',
    'ACADEMIC_ESTIMATE',
    'EXPERIMENTAL',
    'FORECAST',
    'SCENARIO',
  ]),
  publicationStatus: z.string().min(2).max(30),
  licenseCode: z.string().max(80).optional(),
  confidentialityLevel: z.string().min(2).max(30),
  version: datasetVersionInputSchema,
});

export const createIndicatorSchema = z.object({
  statisticalDomainId: uuid,
  ownerOrganizationId: uuid,
  code: z.string().min(1).max(80),
  name: z.string().min(2).max(250),
  shortName: z.string().max(120).optional(),
  definition: z.string().min(2).max(20_000),
  indicatorType: z.string().min(2).max(40),
  dataNature: z.string().min(2).max(40),
  preferredDirection: z.string().max(20).optional(),
  isActive: z.boolean().default(true),
  version: z.object({
    methodologyVersionId: uuid.optional(),
    unitMeasureId: uuid,
    frequencyId: uuid,
    versionNumber: z.number().int().positive(),
    definition: z.string().min(2).max(20_000),
    calculationFormula: z.string().max(20_000).optional(),
    validFrom: date,
    validTo: date.optional(),
    changeReason: z.string().max(10_000).optional(),
    datasetVersionId: uuid.optional(),
    isPrimaryInDataset: z.boolean().default(false),
    sortOrder: z.number().int().min(0).default(0),
  }),
});

export const createMethodologyVersionSchema = methodologyVersionInputSchema;
export const createDatasetVersionSchema = datasetVersionInputSchema;

export const versionTransitionSchema = z.object({ targetStatus: z.string().min(2).max(30) });
export const uuidParamsSchema = z.object({ id: uuid });

export type CreateStatisticalOperationInput = z.infer<typeof createStatisticalOperationSchema>;
export type MethodologyVersionInput = z.infer<typeof methodologyVersionInputSchema>;
export type DatasetVersionInput = z.infer<typeof datasetVersionInputSchema>;
export type CreateMethodologyInput = z.infer<typeof createMethodologySchema>;
export type CreateDataStructureInput = z.infer<typeof createDataStructureSchema>;
export type CreateDatasetInput = z.infer<typeof createDatasetSchema>;
export type CreateIndicatorInput = z.infer<typeof createIndicatorSchema>;
