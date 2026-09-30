import { z } from 'zod';

/**
 * Las estadísticas que el Banco Central de Bolivia publica en cuadernos de Excel.
 *
 * Un archivo por familia (`sector-externo`, `sector-monetario`, `sistema-de-pagos`…) con
 * todas las series que el recolector encontró en sus cuadernos. Cada serie lleva de dónde
 * salió —cuaderno, hoja y la columna o fila exacta— porque una cifra que nadie puede volver
 * a encontrar en su celda no es evidencia. Los valores son texto decimal sin exponente: lo
 * que dice el cuaderno y no un flotante que se haya movido un paso de redondeo.
 *
 * La frecuencia es la que el recolector midió entre los períodos de la serie; `MIXED` es
 * la de una hoja que mezcla meses y años en la misma columna y se declara así en vez de
 * escoger una.
 */

const decimal = z.string().regex(/^-?\d+(?:\.\d+)?$/u, 'una cantidad decimal sin exponente');
const isoDate = z.string().regex(/^(?:19|20)\d{2}-(?:0[1-9]|1[0-2])-(?:0[1-9]|[12]\d|3[01])$/u);

export const BCB_FREQUENCIES = [
  'DAILY',
  'WEEKLY',
  'MONTHLY',
  'QUARTERLY',
  'SEMIANNUAL',
  'ANNUAL',
  'MIXED',
] as const;

const series = z
  .object({
    indicatorCode: z
      .string()
      .regex(/^BCB_[A-Z0-9_]+$/u)
      .max(120),
    name: z.string().trim().min(1).max(200),
    family: z.string().regex(/^[a-z0-9-]+$/u),
    /** El informe, sin fecha ni versión: lo que une a `Semanal 38` con `Semanal 39`. */
    workbook: z.string().min(1).max(300),
    sheet: z.string().min(1).max(120),
    unit: z.string().max(120).nullable(),
    frequency: z.enum(BCB_FREQUENCIES),
    /** Dónde está la serie en la hoja: columna o fila y su primer y último renglón. */
    locator: z.record(z.string(), z.union([z.string(), z.number()])),
    sourceUrl: z.url(),
    upstreamSha256: z.string().regex(/^[a-f0-9]{64}$/u),
    retrievedAt: z.iso.datetime({ offset: false }),
    points: z.array(z.tuple([isoDate, decimal])).min(2).max(20_000),
  })
  .strict()
  .superRefine((one, context) => {
    const dates = one.points.map((point) => point[0]);
    for (let index = 1; index < dates.length; index += 1) {
      const previous = dates[index - 1] ?? '';
      const current = dates[index] ?? '';
      if (current <= previous) {
        context.addIssue({
          code: 'custom',
          path: ['points', index, 0],
          message: `${current} no viene después de ${previous}`,
        });
        return;
      }
    }
  });

export const bcbStatisticsSchema = z
  .object({
    family: z.string().regex(/^[a-z0-9-]+$/u),
    series: z.array(series).min(1).max(20_000),
  })
  .strict()
  .superRefine((file, context) => {
    const codes = new Set<string>();
    for (const [index, one] of file.series.entries()) {
      if (codes.has(one.indicatorCode)) {
        context.addIssue({
          code: 'custom',
          path: ['series', index, 'indicatorCode'],
          message: `${one.indicatorCode} está dos veces en la familia`,
        });
      }
      codes.add(one.indicatorCode);
    }
  });

export type BcbStatistics = z.infer<typeof bcbStatisticsSchema>;
export type BcbSeries = BcbStatistics['series'][number];
