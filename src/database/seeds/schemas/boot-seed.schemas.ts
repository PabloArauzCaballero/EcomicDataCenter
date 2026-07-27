import { z } from 'zod';
import { code, date, nullableText, uuid } from './seed.primitives';

export const frequencySeedSchema = z
  .array(
    z
      .object({
        frequencyId: uuid,
        code: code(10),
        name: code(80),
        periodsPerYear: z.number().int().min(1).max(366).nullable(),
        isoDuration: nullableText(40),
      })
      .strict(),
  )
  .min(1);

export const qualityDimensionSeedSchema = z
  .array(
    z
      .object({
        qualityDimensionId: uuid,
        code: code(50),
        name: code(180),
        description: z.string().trim().min(1).max(5_000).nullable(),
      })
      .strict(),
  )
  .min(1);

export const unitSeedSchema = z
  .array(
    z
      .object({
        unitMeasureId: uuid,
        baseUnitMeasureId: uuid.nullable(),
        code: code(50),
        name: code(180),
        symbol: nullableText(30),
        multiplierPower10: z.number().int().min(-18).max(18),
        valueKind: z.enum(['CURRENCY', 'RATE', 'INDEX', 'COUNT', 'QUANTITY', 'DURATION']),
      })
      .strict(),
  )
  .min(1);

export const geographicUnitSeedSchema = z
  .array(
    z
      .object({
        geographicUnitId: uuid,
        parentGeographicUnitId: uuid.nullable(),
        officialCode: code(80),
        name: code(250),
        geographicLevel: z.enum([
          'COUNTRY',
          'DEPARTMENT',
          'PROVINCE',
          'MUNICIPALITY',
          'LOCALITY',
          'ECONOMIC_REGION',
        ]),
        validFrom: date,
        validTo: date.nullable(),
        geometryReference: nullableText(500),
      })
      .strict(),
  )
  .min(1);

export const statisticalDomainSeedSchema = z
  .array(
    z
      .object({
        statisticalDomainId: uuid,
        parentDomainId: uuid.nullable(),
        code: code(50),
        name: code(180),
        description: nullableText(5_000),
        sortOrder: z.number().int().min(0).max(10_000),
        isActive: z.boolean(),
      })
      .strict(),
  )
  .min(1);

export const currencySeedSchema = unitSeedSchema;

export const countrySeedSchema = geographicUnitSeedSchema;

const boundedText = (maximum: number) => z.string().trim().min(1).max(maximum);

export const economicActivitySeedSchema = z
  .object({
    organizations: z
      .array(
        z
          .object({
            organizationId: uuid,
            code: code(50),
            legalName: code(250),
            shortName: code(80),
            organizationType: code(40),
            countryCode: z.string().regex(/^[A-Z]{2}$/),
            officialStatisticsProducer: z.boolean(),
            isActive: z.literal(true),
            validFrom: date,
          })
          .strict(),
      )
      .min(1),
    classification: z
      .object({
        classificationId: uuid,
        custodianOrganizationId: uuid,
        code: code(80),
        name: code(250),
        classificationType: code(50),
      })
      .strict(),
    version: z
      .object({
        classificationVersionId: uuid,
        classificationId: uuid,
        versionCode: code(40),
        name: code(250),
        validFrom: date.nullable(),
        validTo: date.nullable(),
        publicationDate: date.nullable(),
        isCurrent: z.boolean(),
        methodologyUri: nullableText(2_000),
      })
      .strict(),
    items: z
      .array(
        z
          .object({
            classificationItemId: uuid,
            classificationVersionId: uuid,
            parentItemId: uuid.nullable(),
            code: code(80),
            name: boundedText(300),
            description: nullableText(5_000),
            levelNo: z.number().int().min(1).max(10),
            sortOrder: z.number().int().min(0).max(10_000),
            validFrom: date.nullable(),
            validTo: date.nullable(),
          })
          .strict(),
      )
      .min(1),
  })
  .strict();
