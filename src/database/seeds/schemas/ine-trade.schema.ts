import { z } from 'zod';

/**
 * La base de comercio exterior del INE, resumida por `yarn trade-records:collect`.
 *
 * Un archivo por flujo y año (`exports-2025.json`, `imports-2025.json`) y un
 * catálogo común con los nombres y las clasificaciones de cada código. Las
 * filas son arreglos posicionales y no objetos: son cuarenta y siete mil por
 * año de importaciones, y repetir los nombres de campo en cada una triplicaría
 * el archivo. `columns` dice qué es cada posición y el sembrador lo comprueba
 * contra lo que la vista de lectura espera.
 */

const cell = z.union([z.string().max(12), z.number()]);
const row = z.array(cell).min(3).max(9);

export const EXPECTED_COLUMNS = {
  X: {
    detail: ['month', 'nandina', 'country', 'department', 'kind', 'usd', 'kg', 'fineKg'],
    monthly: [] as string[],
  },
  M: {
    detail: ['nandina', 'country', 'usd', 'fobUsd', 'kg'],
    monthly: ['month', 'use', 'chapter', 'department', 'usd', 'fobUsd', 'kg'],
  },
} as const;

export const tradeYearSchema = z
  .object({
    flow: z.enum(['X', 'M']),
    year: z.number().int().min(1990).max(2100),
    label: z.string().trim().min(1).max(80),
    provisional: z.boolean(),
    months: z.array(z.number().int().min(1).max(12)).min(1).max(12),
    records: z.number().int().positive(),
    totals: z.object({ usd: z.number(), kg: z.number(), fobUsd: z.number() }),
    provenance: z.object({
      publisher: z.string().trim().min(1),
      title: z.string().trim().min(1),
      sourceUrl: z.string().url(),
      upstreamSha256: z.string().regex(/^[0-9a-f]{64}$/u),
      retrievedAt: z.string().datetime(),
    }),
    columns: z.object({
      detail: z.array(z.string()).min(1),
      monthly: z.array(z.string()),
    }),
    detail: z.array(row).min(1),
    monthly: z.array(row),
  })
  .superRefine((seed, context) => {
    const expected = EXPECTED_COLUMNS[seed.flow];
    const same = (left: readonly string[], right: readonly string[]): boolean =>
      left.length === right.length && left.every((name, index) => name === right[index]);
    if (
      !same(seed.columns.detail, expected.detail) ||
      !same(seed.columns.monthly, expected.monthly)
    ) {
      context.addIssue({
        code: z.ZodIssueCode.custom,
        message: `${seed.label}: las columnas no son las que la vista de lectura espera`,
      });
    }
    const width = expected.detail.length;
    if (seed.detail.some((entry) => entry.length !== width)) {
      context.addIssue({
        code: z.ZodIssueCode.custom,
        message: `${seed.label}: hay filas de detalle con otro número de columnas`,
      });
    }
  });

export type TradeYear = z.infer<typeof tradeYearSchema>;

const named = z.record(z.string(), z.string());
const grouped = z.record(z.string(), z.object({ name: z.string(), group: z.string() }));

export const tradeCatalogueSchema = z.object({
  products: z.record(
    z.string().regex(/^\d{10}$/u),
    z.object({
      name: z.string().min(1),
      chapter: z.string().regex(/^\d{2}$/u),
      cuci: z.string().optional(),
      gce: z.string().optional(),
      ciiu: z.string().optional(),
      activity: z.string().optional(),
      tnt: z.string().optional(),
      use: z.string().optional(),
    }),
  ),
  chapters: z.record(
    z.string(),
    z.object({ name: z.string().nullable(), section: z.string().nullable() }),
  ),
  sections: named,
  activities: grouped,
  traditional: grouped,
  uses: named,
  gce: named,
  cuci: named,
  ciiu: named,
  countries: z.record(
    z.string(),
    z.object({ name: z.string(), zone: z.string().nullable(), bloc: z.string().nullable() }),
  ),
  departments: named,
});

export type TradeCatalogue = z.infer<typeof tradeCatalogueSchema>;
