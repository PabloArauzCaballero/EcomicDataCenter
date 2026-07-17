import { z } from 'zod';

const uuid = z.string().uuid();
const date = z.iso.date();
const code = (maximum: number) => z.string().trim().min(1).max(maximum);
const nullableText = (maximum: number) => z.string().trim().min(1).max(maximum).nullable();

export const frequencySeedSchema = z.array(
  z.object({
    frequencyId: uuid,
    code: code(10),
    name: code(80),
    periodsPerYear: z.number().int().min(1).max(366).nullable(),
    isoDuration: nullableText(40),
  }).strict(),
).min(1);

export const qualityDimensionSeedSchema = z.array(
  z.object({
    qualityDimensionId: uuid,
    code: code(50),
    name: code(180),
    description: z.string().trim().min(1).max(5_000).nullable(),
  }).strict(),
).min(1);

export const unitSeedSchema = z.array(
  z.object({
    unitMeasureId: uuid,
    baseUnitMeasureId: uuid.nullable(),
    code: code(50),
    name: code(180),
    symbol: nullableText(30),
    multiplierPower10: z.number().int().min(-18).max(18),
    valueKind: z.enum(['CURRENCY', 'RATE', 'INDEX', 'COUNT', 'QUANTITY', 'DURATION']),
  }).strict(),
).min(1);

const organizationSchema = z.object({
  organizationId: uuid,
  code: code(50),
  legalName: code(250),
  shortName: code(80),
  organizationType: code(40),
  countryCode: z.string().regex(/^[A-Z]{2}$/),
  officialStatisticsProducer: z.boolean(),
  isActive: z.literal(true),
  validFrom: date,
}).strict();

const sourceSchema = z.object({
  sourceId: uuid,
  frequencyId: uuid,
  code: code(80),
  name: code(250),
  sourceType: z.literal('SYNTHETIC'),
  accessMethod: z.enum(['FILE', 'API', 'SDMX', 'DATABASE']),
  isActive: z.literal(true),
}).strict();

const artifactSchema = z.object({
  sourceArtifactId: uuid,
  artifactType: code(40),
  storageUri: z.string().startsWith('mock://').max(2_000),
  mimeType: code(120),
  sha256: z.string().regex(/^[a-f0-9]{64}$/),
  retrievedAt: z.iso.datetime(),
  fileSizeBytes: z.string().regex(/^[1-9]\d*$/),
  metadataJson: z.record(z.string(), z.unknown()).refine((value) => value.synthetic === true, {
    message: 'Mock artifact metadata must be marked synthetic',
  }),
}).strict();

const conceptSchema = z.object({
  conceptId: uuid,
  code: code(80),
  name: code(180),
  definition: z.string().trim().min(1).max(5_000),
  conceptType: z.enum(['DIMENSION', 'MEASURE']),
}).strict();

export const mockSeedSchema = z.object({
  organization: organizationSchema,
  domain: z.object({
    statisticalDomainId: uuid,
    code: code(50),
    name: code(180),
    sortOrder: z.number().int().min(0),
    isActive: z.literal(true),
  }).strict(),
  source: sourceSchema,
  artifact: artifactSchema,
  concepts: z.tuple([conceptSchema, conceptSchema]).superRefine((concepts, context) => {
    const kinds = new Set(concepts.map((concept) => concept.conceptType));
    if (!kinds.has('DIMENSION') || !kinds.has('MEASURE')) {
      context.addIssue({ code: 'custom', message: 'Mock seed requires one dimension and one measure concept' });
    }
  }),
  codeList: z.object({
    codeListId: uuid,
    code: code(80),
    name: code(180),
    versionCode: code(40),
    items: z.array(z.object({
      codeItemId: uuid,
      code: code(80),
      name: code(180),
    }).strict()).min(1).max(100),
  }).strict(),
  methodology: z.object({
    methodologyId: uuid,
    methodologyVersionId: uuid,
    code: code(80),
    name: code(250),
    methodologyType: code(40),
    versionCode: code(40),
    title: code(300),
    validFrom: date,
    publicationDate: date,
  }).strict(),
  structure: z.object({
    dataStructureId: uuid,
    dimensionDefinitionId: uuid,
    measureDefinitionId: uuid,
    code: code(80),
    name: code(250),
    versionCode: code(40),
  }).strict(),
  dataset: z.object({
    datasetId: uuid,
    datasetVersionId: uuid,
    code: code(80),
    name: code(250),
    versionCode: code(40),
    title: code(300),
    validFrom: date,
    publicationDate: date,
  }).strict(),
  indicator: z.object({
    indicatorId: uuid,
    indicatorVersionId: uuid,
    code: code(80),
    name: code(250),
    definition: z.string().trim().min(1).max(5_000),
  }).strict(),
}).strict().superRefine((seed, context) => {
  if (!seed.organization.code.startsWith('DEMO-')) {
    context.addIssue({ code: 'custom', path: ['organization', 'code'], message: 'Mock organization must use DEMO- prefix' });
  }
  const ids = collectMockIds(seed);
  if (new Set(ids).size !== ids.length) {
    context.addIssue({ code: 'custom', message: 'Mock seed UUIDs must be globally unique' });
  }
});

function collectMockIds(seed: {
  organization: { organizationId: string };
  domain: { statisticalDomainId: string };
  source: { sourceId: string };
  artifact: { sourceArtifactId: string };
  concepts: readonly { conceptId: string }[];
  codeList: { codeListId: string; items: readonly { codeItemId: string }[] };
  methodology: { methodologyId: string; methodologyVersionId: string };
  structure: { dataStructureId: string; dimensionDefinitionId: string; measureDefinitionId: string };
  dataset: { datasetId: string; datasetVersionId: string };
  indicator: { indicatorId: string; indicatorVersionId: string };
}): string[] {
  return [
    seed.organization.organizationId,
    seed.domain.statisticalDomainId,
    seed.source.sourceId,
    seed.artifact.sourceArtifactId,
    ...seed.concepts.map((concept) => concept.conceptId),
    seed.codeList.codeListId,
    ...seed.codeList.items.map((item) => item.codeItemId),
    seed.methodology.methodologyId,
    seed.methodology.methodologyVersionId,
    seed.structure.dataStructureId,
    seed.structure.dimensionDefinitionId,
    seed.structure.measureDefinitionId,
    seed.dataset.datasetId,
    seed.dataset.datasetVersionId,
    seed.indicator.indicatorId,
    seed.indicator.indicatorVersionId,
  ];
}

export type MockSeed = z.infer<typeof mockSeedSchema>;
