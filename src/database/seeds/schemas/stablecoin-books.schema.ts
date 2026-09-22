import { z } from 'zod';
import { date } from './seed.primitives';

/**
 * Las cotizaciones del libro entre particulares, por ficha estable y por lado.
 *
 * Existe porque estas lecturas tenían **una sola vía** para llegar a una base:
 * el recolector diario las publica por la API, y esa API es la de un servidor
 * concreto. Cualquier otro despliegue —el segundo servidor, una restauración,
 * un arranque en limpio— se quedaba sin ellas, y el panel del riel aparecía
 * vacío ahí aunque el código fuese el mismo y el recolector estuviera en verde.
 *
 * Con la ficha en una semilla, las lecturas viajan en el repositorio y entran
 * al arrancar, que es exactamente cómo llegan ya las cotizaciones del banco
 * central. No sustituye a la vía de la API: la duplica a propósito, porque las
 * dos fallan por motivos distintos y ninguna base debería depender de una sola.
 *
 * El archivo se acumula un día a la vez y su historia empieza donde empezó el
 * recolector. Eso se dice en vez de disimularlo: una serie que arranca un
 * martes porque fue cuando alguien miró es honesta; una rellenada hacia atrás
 * con estimaciones, no.
 */
export const stablecoinBooksSchema = z.object({
  quotes: z
    .array(
      z
        .object({
          /** `FX_PARALLEL_<FICHA>_BOB`, el mismo código que publica la API. */
          indicatorCode: z
            .string()
            .regex(/^FX_PARALLEL_[A-Z0-9]+_BOB$/u)
            .max(60),
          /** La ficha como la deletrea el libro: USDT, USDC. */
          asset: z
            .string()
            .regex(/^[A-Z0-9]{2,10}$/u)
            .max(10),
          /**
           * El lado en los términos del lector, ya resuelto.
           *
           * `SELL` es lo que el mercado le vende un dólar, el número alto. La
           * inversión entre lo que se pide a la bolsa y lo que rotula el aviso
           * se resuelve en el parser, antes de llegar aquí, y por eso este
           * campo no admite otra lectura.
           */
          priceSide: z.enum(['BUY', 'SELL']),
          eventDate: date,
          value: z.string().regex(/^\d+(\.\d+)?$/u),
          unit: z.string().trim().min(2).max(20),
          /** Cuántos avisos se leyeron para la mediana, que es el método. */
          advertisementsRead: z.number().int().min(1).max(200),
          /**
           * El fragmento literal del aviso del que salió el precio.
           *
           * El tope es el mismo 4.000 que acepta la ingesta por la API, a
           * propósito: las dos vías guardan la misma evidencia y una no puede
           * admitir lo que la otra rechaza. Un aviso completo mide entre 2,3 y
           * 3,4 kB, así que cabe entero y no se recorta. Con un tope menor el
           * extracto quedaba cortado a mitad de clave, y media prueba no
           * prueba.
           */
          excerpt: z.string().trim().min(20).max(4_000),
          sourceUrl: z.url(),
          documentSha256: z.string().regex(/^[a-f0-9]{64}$/u),
          retrievedAt: z.iso.datetime({ offset: false }),
        })
        .strict(),
    )
    .min(1)
    .max(5_000),
});

export type StablecoinBooks = z.infer<typeof stablecoinBooksSchema>;
export type StablecoinBookSeedQuote = StablecoinBooks['quotes'][number];
