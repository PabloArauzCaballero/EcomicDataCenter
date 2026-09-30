import { z } from 'zod';

/**
 * Los bancos bolivianos que ofrecen dólares digitales (USDT, USDC) a sus
 * clientes, y las condiciones que publican.
 *
 * Ningún banco publica el precio al que compra o vende: la cotización se ve
 * dentro de la aplicación, ya autenticado. Lo que sí es público y cambia con el
 * tiempo es SI el servicio existe y con qué límites, y eso es lo que se
 * guarda. Por eso hay dos clases de serie:
 *
 * - `OFFERED`: 1 mientras la página oficial del banco anuncia el servicio, 0 si
 *   la página responde y ya no lo nombra. Una página que no responde NO escribe
 *   un 0: no saber no es lo mismo que haberlo retirado.
 * - `LIMIT`: una cifra que la página oficial declara (mínimo o máximo por
 *   operación, por día).
 *
 * `basis` dice de dónde salió cada punto, porque no valen lo mismo:
 * `ANNOUNCEMENT` es la fecha en que el banco o la prensa dicen que arrancó,
 * `FIRST_PUBLIC_DOCUMENT` es la fecha del primer documento oficial que
 * conservamos cuando el banco nunca dijo cuándo empezó, y `OFFICIAL_PAGE` es
 * una lectura diaria de su propia página. La huella de un `ANNOUNCEMENT` es la
 * del pasaje citado, no la de la página entera, que no se conservó.
 */

const measured = z.string().regex(/^-?\d+(?:\.\d+)?$/u, 'una cantidad decimal sin exponente');

export const BANK_ASSETS = ['USDT', 'USDC'] as const;
export const BANK_POINT_BASES = ['ANNOUNCEMENT', 'FIRST_PUBLIC_DOCUMENT', 'OFFICIAL_PAGE'] as const;

const point = z
  .object({
    date: z.string().regex(/^20\d{2}-(?:0[1-9]|1[0-2])-(?:0[1-9]|[12]\d|3[01])$/u),
    value: measured,
    basis: z.enum(BANK_POINT_BASES),
    /** El pasaje literal del que salió la cifra: aparece tal cual en la fuente. */
    excerpt: z.string().min(8).max(1_200),
    sourceUrl: z.url(),
    upstreamSha256: z.string().regex(/^[a-f0-9]{64}$/u),
    retrievedAt: z.iso.datetime({ offset: false }),
  })
  .strict();

const series = z
  .object({
    indicatorCode: z
      .string()
      .regex(/^VASP_[A-Z0-9_]+$/u)
      .max(80),
    /** El banco, en mayúsculas y sin espacios: BNB, GANADERO, BISA… */
    bank: z.string().regex(/^[A-Z0-9]{2,20}$/u),
    bankName: z.string().trim().min(3).max(120),
    product: z.string().trim().min(3).max(80),
    asset: z.enum(BANK_ASSETS),
    kind: z.enum(['OFFERED', 'LIMIT']),
    /** Para `LIMIT`: qué límite es (`TRADE_MIN`, `TRADE_MAX_DAY`…). */
    limit: z
      .string()
      .regex(/^[A-Z_]+$/u)
      .max(30)
      .optional(),
    unit: z.string().trim().min(2).max(20),
    note: z.string().trim().min(5).max(400),
    points: z.array(point).min(1).max(4_000),
  })
  .strict()
  .superRefine((one, context) => {
    if ((one.kind === 'LIMIT') !== (one.limit !== undefined)) {
      context.addIssue({
        code: 'custom',
        path: ['limit'],
        message: 'un límite dice cuál es, y un anuncio de servicio no lleva ninguno',
      });
    }
    const seen = new Set<string>();
    for (const [index, entry] of one.points.entries()) {
      if (one.kind === 'OFFERED' && entry.value !== '0' && entry.value !== '1') {
        context.addIssue({
          code: 'custom',
          path: ['points', index, 'value'],
          message: 'el servicio está (1) o no está (0)',
        });
      }
      if (seen.has(entry.date)) {
        context.addIssue({
          code: 'custom',
          path: ['points', index, 'date'],
          message: `${entry.date} está dos veces en la misma serie`,
        });
      }
      seen.add(entry.date);
    }
  });

export const bankVirtualAssetsSchema = z.object({
  series: z.array(series).min(1).max(60),
});

export type BankVirtualAssets = z.infer<typeof bankVirtualAssetsSchema>;
export type BankSeries = BankVirtualAssets['series'][number];
export type BankPoint = BankSeries['points'][number];
