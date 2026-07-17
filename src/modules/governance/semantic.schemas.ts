import { z } from 'zod';

const uuid = z.string().uuid();
const date = z.iso.date();

export const createDomainSchema = z.object({
  parentDomainId: uuid.optional(),
  code: z.string().min(1).max(50),
  name: z.string().min(2).max(180),
  description: z.string().max(5_000).optional(),
  sortOrder: z.number().int().min(0).default(0),
  isActive: z.boolean().default(true),
});

export const createConceptSchema = z.object({
  ownerOrganizationId: uuid,
  code: z.string().min(1).max(80),
  name: z.string().min(2).max(180),
  definition: z.string().min(2).max(20_000),
  conceptType: z.string().min(2).max(40),
  validFrom: date.optional(),
  validTo: date.optional(),
});

export const createFrequencySchema = z.object({
  code: z.string().min(1).max(10),
  name: z.string().min(2).max(80),
  periodsPerYear: z.number().int().positive().optional(),
  isoDuration: z.string().max(40).optional(),
});

export const createUnitMeasureSchema = z.object({
  baseUnitMeasureId: uuid.optional(),
  code: z.string().min(1).max(50),
  name: z.string().min(2).max(180),
  symbol: z.string().max(30).optional(),
  multiplierPower10: z.number().int().min(-18).max(18).default(0),
  valueKind: z.string().min(2).max(30),
});

export const createGeographicUnitSchema = z
  .object({
    parentGeographicUnitId: uuid.optional(),
    officialCode: z.string().min(1).max(80),
    name: z.string().min(2).max(250),
    geographicLevel: z.string().min(2).max(40),
    validFrom: date,
    validTo: date.optional(),
    geometryReference: z.string().max(4_000).optional(),
  })
  .refine((value) => !value.validTo || value.validTo >= value.validFrom, {
    path: ['validTo'],
    message: 'validTo precedes validFrom',
  });

const codeListItemSchema = z.object({
  code: z.string().min(1).max(80),
  parentCode: z.string().max(80).optional(),
  name: z.string().min(1).max(250),
  description: z.string().max(5_000).optional(),
  sortOrder: z.number().int().min(0).default(0),
  validFrom: date.optional(),
  validTo: date.optional(),
  isActive: z.boolean().default(true),
});

export const createCodeListSchema = z.object({
  ownerOrganizationId: uuid,
  code: z.string().min(1).max(80),
  name: z.string().min(2).max(180),
  versionCode: z.string().min(1).max(40),
  validFrom: date.optional(),
  validTo: date.optional(),
  items: z.array(codeListItemSchema).max(10_000).default([]),
});

const classificationItemSchema = z.object({
  code: z.string().min(1).max(80),
  parentCode: z.string().max(80).optional(),
  name: z.string().min(1).max(300),
  description: z.string().max(5_000).optional(),
  levelNo: z.number().int().min(0),
  sortOrder: z.number().int().min(0).default(0),
  validFrom: date.optional(),
  validTo: date.optional(),
});

export const createClassificationSchema = z.object({
  custodianOrganizationId: uuid,
  code: z.string().min(1).max(80),
  name: z.string().min(2).max(250),
  classificationType: z.string().min(2).max(50),
  version: z.object({
    versionCode: z.string().min(1).max(40),
    name: z.string().min(2).max(250),
    validFrom: date.optional(),
    validTo: date.optional(),
    publicationDate: date.optional(),
    isCurrent: z.boolean().default(false),
    methodologyUri: z.string().url().optional(),
    items: z.array(classificationItemSchema).max(20_000).default([]),
  }),
});

export const createClassificationMappingSchema = z.object({
  sourceItemId: uuid,
  targetItemId: uuid,
  equivalenceType: z.string().min(2).max(30),
  weight: z.string().regex(/^(?:0|[1-9]\d*)(?:\.\d+)?$/).optional(),
  validFrom: date.optional(),
  validTo: date.optional(),
  evidenceNote: z.string().max(5_000).optional(),
});

export type CreateDomainInput = z.infer<typeof createDomainSchema>;
export type CreateConceptInput = z.infer<typeof createConceptSchema>;
export type CreateFrequencyInput = z.infer<typeof createFrequencySchema>;
export type CreateUnitMeasureInput = z.infer<typeof createUnitMeasureSchema>;
export type CreateGeographicUnitInput = z.infer<typeof createGeographicUnitSchema>;
export type CreateCodeListInput = z.infer<typeof createCodeListSchema>;
export type CreateClassificationInput = z.infer<typeof createClassificationSchema>;
export type CreateClassificationMappingInput = z.infer<typeof createClassificationMappingSchema>;
