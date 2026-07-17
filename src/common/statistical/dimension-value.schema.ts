import { z } from 'zod';

const uuid = z.string().uuid();
const isoDate = z.iso.date();
const decimal = z.string().regex(/^-?(?:0|[1-9]\d*)(?:\.\d+)?$/, 'Expected a decimal string');

/**
 * Represents one typed value for a dimension definition.
 * Exactly one value variant must be present.
 */
export const dimensionValueSchema = z
  .object({
    dimensionDefinitionId: uuid,
    codeItemId: uuid.optional(),
    classificationItemId: uuid.optional(),
    geographicUnitId: uuid.optional(),
    textValue: z.string().min(1).max(2_000).optional(),
    numericValue: decimal.optional(),
    dateValue: isoDate.optional(),
  })
  .strict()
  .superRefine((value, context) => {
    const variants = [
      value.codeItemId,
      value.classificationItemId,
      value.geographicUnitId,
      value.textValue,
      value.numericValue,
      value.dateValue,
    ];
    if (variants.filter((entry) => entry !== undefined).length !== 1) {
      context.addIssue({ code: 'custom', message: 'Exactly one dimension value is required' });
    }
  });

export type DimensionValueInput = z.infer<typeof dimensionValueSchema>;
