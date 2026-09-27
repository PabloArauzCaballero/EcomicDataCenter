import { z } from 'zod';
import { date } from './seed.primitives';

/**
 * El dólar oficial y el paralelo, un día cerrado a la vez.
 *
 * Las dos series solo llegaban por la API del recolector diario, y esa API es
 * la de un servidor: el segundo despliegue (Contabo) se quedó con el dólar del
 * día en que se copió su base, mientras el oficial se movía de 11,00 a 12,26 Bs
 * en una semana. Una semilla viaja en el repositorio y entra en cualquier base
 * que arranque.
 *
 * Cada lectura lleva su propia procedencia —URL, huella del documento y
 * fragmento literal— porque el archivo crece cada día: una procedencia única
 * para todo el archivo cambiaría con cada corrida, cambiaría la huella de cada
 * lectura ya guardada y el sembrador las reinsertaría todas.
 */
export const fxDailySchema = z.object({
  readings: z
    .array(
      z
        .object({
          indicatorCode: z.enum(['FX_PARALLEL_USD_BOB', 'FX_OFFICIAL_USD_BOB']),
          priceSide: z.enum(['BUY', 'SELL']),
          eventDate: date,
          value: z.string().regex(/^\d+(\.\d+)?$/u),
          unit: z.string().trim().min(2).max(20),
          publisher: z.string().trim().min(2).max(60),
          /** Quien fija la cifra, cuando no es quien la publica: el BCB para el oficial. */
          originator: z.string().trim().min(2).max(60).optional(),
          assertion: z.string().trim().min(20).max(400),
          /** El objeto del día tal como lo escribe la respuesta: contiene la cifra literal. */
          excerpt: z.string().trim().min(10).max(600),
          sourceUrl: z.url(),
          documentSha256: z.string().regex(/^[a-f0-9]{64}$/u),
          retrievedAt: z.iso.datetime({ offset: false }),
        })
        .strict(),
    )
    .min(1)
    .max(20_000),
});

export type FxDaily = z.infer<typeof fxDailySchema>;
export type FxDailyReading = FxDaily['readings'][number];
