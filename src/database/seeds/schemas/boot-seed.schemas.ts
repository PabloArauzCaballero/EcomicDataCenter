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

/**
 * Identity the hosted collector writes for.
 *
 * The organization is declared once and injected into the source and the agent
 * by the runner rather than repeated in the catalog, so the file cannot describe
 * a source owned by one institution and an agent owned by another.
 */
const agentSeedSchema = z
  .object({
    aiAgentId: uuid,
    code: z
      .string()
      .regex(/^[A-Z0-9][A-Z0-9_-]*$/u)
      .min(2)
      .max(80),
    name: code(250),
    agentType: z.enum([
      'EXCHANGE_RATE',
      'SOVEREIGN_DEBT',
      'SECTOR',
      'SOCIOECONOMIC',
      'SENTIMENT',
      'UNCERTAINTY',
      'CORPORATE',
      'POLITICAL',
      'SECURITIES_MARKET',
      'FINANCIAL_SYSTEM',
      'EXTERNAL_SECTOR',
    ]),
    provider: code(80),
    modelIdentifier: code(120),
    specialty: code(120),
    promptVersion: code(40),
    schemaVersion: code(40),
  })
  .strict();

export const agentBootstrapSeedSchema = z
  .object({
    organization: z
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
    source: z
      .object({
        sourceId: uuid,
        code: code(80),
        name: code(250),
        sourceType: code(40),
        accessMethod: code(40),
        isActive: z.literal(true),
      })
      .strict(),
    agent: agentSeedSchema,
    backfillAgents: z.array(agentSeedSchema).min(1).max(20),
  })
  .strict();

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
