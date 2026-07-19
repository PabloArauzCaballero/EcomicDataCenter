import { z } from 'zod';
import { dimensionValueSchema } from '../../common/statistical/dimension-value.schema';
import type { DimensionValueInput } from '../../common/statistical/dimension-value.schema';

const uuid = z.string().uuid();
const isoDate = z.iso.date();
const decimal = z.string().regex(/^-?(?:0|[1-9]\d*)(?:\.\d+)?$/, 'Expected a decimal string');

export const measureValueSchema = z
  .object({
    measureDefinitionId: uuid,
    numericValue: decimal.optional(),
    textValue: z.string().min(1).max(50_000).optional(),
    booleanValue: z.boolean().optional(),
  })
  .strict()
  .superRefine((value, context) => {
    const values = [value.numericValue, value.textValue, value.booleanValue];
    if (values.filter((entry) => entry !== undefined).length !== 1) {
      context.addIssue({ code: 'custom', message: 'Exactly one measure value is required' });
    }
  });

export const attributeValueSchema = z
  .object({
    attributeDefinitionId: uuid,
    codeItemId: uuid.optional(),
    numericValue: decimal.optional(),
    textValue: z.string().min(1).max(50_000).optional(),
    booleanValue: z.boolean().optional(),
  })
  .strict()
  .superRefine((value, context) => {
    const values = [value.codeItemId, value.numericValue, value.textValue, value.booleanValue];
    if (values.filter((entry) => entry !== undefined).length !== 1) {
      context.addIssue({ code: 'custom', message: 'Exactly one attribute value is required' });
    }
  });

export const observationRecordSchema = z
  .object({
    indicatorVersionId: uuid.optional(),
    frequencyId: uuid,
    unitMeasureId: uuid.optional(),
    periodStart: isoDate,
    periodEnd: isoDate,
    periodCode: z.string().min(1).max(40),
    referenceDate: isoDate.optional(),
    dimensions: z.array(dimensionValueSchema).min(1).max(50),
    measures: z.array(measureValueSchema).min(1).max(50),
    attributes: z.array(attributeValueSchema).max(50).default([]),
    confidentialityStatus: z.string().min(1).max(30),
    publicationDate: isoDate.optional(),
    vintageDate: isoDate,
    revisionReason: z.string().max(5_000).optional(),
  })
  .strict()
  .superRefine((value, context) => {
    if (value.periodEnd < value.periodStart) {
      context.addIssue({
        code: 'custom',
        path: ['periodEnd'],
        message: 'periodEnd precedes periodStart',
      });
    }
    const unique = (ids: string[], path: string): void => {
      if (new Set(ids).size !== ids.length) {
        context.addIssue({
          code: 'custom',
          path: [path],
          message: `Duplicate ${path} definitions`,
        });
      }
    };
    unique(
      value.dimensions.map((item) => item.dimensionDefinitionId),
      'dimensions',
    );
    unique(
      value.measures.map((item) => item.measureDefinitionId),
      'measures',
    );
    unique(
      value.attributes.map((item) => item.attributeDefinitionId),
      'attributes',
    );
  });

export const registerObservationSchema = z
  .object({
    batchCode: z.string().trim().min(3).max(80),
    datasetVersionId: uuid,
    sourceArtifactId: uuid,
    submittedByOrganizationId: uuid,
    record: observationRecordSchema,
  })
  .strict();

export const importObservationBatchSchema = z
  .object({
    batchCode: z.string().trim().min(3).max(80),
    datasetVersionId: uuid,
    sourceArtifactId: uuid,
    submittedByOrganizationId: uuid,
    entryMethod: z.enum(['FILE', 'API', 'SDMX', 'DATABASE', 'MANUAL']),
    notes: z.string().max(5_000).optional(),
    records: z.array(observationRecordSchema).min(1).max(500),
  })
  .strict();

export type { DimensionValueInput };
export type MeasureValueInput = z.infer<typeof measureValueSchema>;
export type AttributeValueInput = z.infer<typeof attributeValueSchema>;
export type ObservationRecordInput = z.infer<typeof observationRecordSchema>;
export type RegisterObservationInput = z.infer<typeof registerObservationSchema>;
export type ImportObservationBatchInput = z.infer<typeof importObservationBatchSchema>;
