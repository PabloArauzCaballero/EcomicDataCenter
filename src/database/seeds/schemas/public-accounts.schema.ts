import { z } from 'zod';

/**
 * Las cuentas públicas: lo que el Estado recauda, gasta, debe y subvenciona.
 *
 * Un archivo por familia (`recaudacion-ocde`, `spnf`, `deuda-tgn`…) con las series que su
 * recolector encontró. Cada serie lleva de dónde salió —la dirección del cuaderno o de la
 * consulta, su huella y la fila o la clave exactas— porque una cifra fiscal que nadie puede
 * volver a encontrar en su celda no es evidencia de nada. Los valores son texto decimal sin
 * exponente: lo que dice el editor y no un flotante que se movió un paso de redondeo.
 *
 * Los cuadernos del Estado se publican con cifras preliminares que luego se revisan. Una
 * serie revisada trae la misma lista de puntos con alguno distinto: la huella del bloque
 * cambia y entra como bloque nuevo, y la vista se queda con el recibido más tarde.
 */

const decimal = z.string().regex(/^-?\d+(?:\.\d+)?$/u, 'una cantidad decimal sin exponente');
const isoDate = z.string().regex(/^(?:19|20)\d{2}-(?:0[1-9]|1[0-2])-(?:0[1-9]|[12]\d|3[01])$/u);

export const ACCOUNT_UNITS = ['PCT_GDP', 'PCT_REVENUE', 'MM_BOB', 'MM_USD', 'PCT'] as const;
export const ACCOUNT_FREQUENCIES = ['ANNUAL', 'MONTHLY'] as const;

const series = z
  .object({
    indicatorCode: z
      .string()
      .regex(/^FISC_[A-Z0-9_]+$/u)
      .max(140),
    name: z.string().trim().min(1).max(260),
    family: z.string().regex(/^[a-z0-9-]+$/u),
    /** Qué mide: `recaudacion`, `ingreso`, `gasto`, `resultado`, `financiamiento`, `deuda`, `subsidio`. */
    topic: z.string().regex(/^[a-z]+$/u),
    /** ISO3 del país que describe. */
    place: z.string().regex(/^[A-Z]{3}$/u),
    /** El concepto dentro del tema, sin el país ni el perímetro. */
    concept: z.string().regex(/^[A-Z0-9_]+$/u),
    /** Qué parte del Estado cubre: `GG`, `SPNF`, `EMP`, `TGN`, `FMI`… */
    perimeter: z.string().regex(/^[A-Z_]+$/u),
    unit: z.enum(ACCOUNT_UNITS),
    frequency: z.enum(ACCOUNT_FREQUENCIES),
    publisher: z.string().trim().min(1).max(200),
    locator: z.record(z.string(), z.union([z.string(), z.number()])),
    sourceUrl: z.url(),
    upstreamSha256: z.string().regex(/^[a-f0-9]{64}$/u),
    retrievedAt: z.iso.datetime({ offset: false }),
    points: z.array(z.tuple([isoDate, decimal])).min(2).max(2_000),
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

export const publicAccountsSchema = z
  .object({
    family: z.string().regex(/^[a-z0-9-]+$/u),
    series: z.array(series).min(1).max(2_000),
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

export type PublicAccounts = z.infer<typeof publicAccountsSchema>;
export type AccountSeries = PublicAccounts['series'][number];
