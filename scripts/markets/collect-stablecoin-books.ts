import { createHash } from 'node:crypto';
import { existsSync, readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import {
  BOOK_DEPTH,
  BOOK_SIDE_REQUEST,
  EmptyBookError,
  STABLECOIN_SERIES,
  parseStablecoinBook,
  type BookSide,
  type StablecoinAsset,
} from '../../src/modules/intelligence/stablecoin-book-parsers';
import { stablecoinBookMeasure } from '../../src/modules/intelligence/stablecoin-book-readings';
import type { StablecoinBookSeedQuote } from '../../src/database/seeds/schemas/stablecoin-books.schema';

/**
 * Captura el libro en bolivianos de cada ficha estable y lo deja en una semilla.
 *
 * El recolector diario ya lee estos mismos libros y publica las lecturas por la
 * API, y eso bastaba mientras hubo un solo servidor. Con dos, no: la API a la
 * que escribe es la de uno de ellos, así que el otro mostraba el panel del riel
 * sin la ficha que le faltaba —y sin manera de notarlo, porque el recolector
 * seguía saliendo en verde—. Una semilla viaja en el repositorio y entra al
 * arrancar, de modo que cualquier despliegue, restauración o arranque en limpio
 * la tiene.
 *
 * No sustituye a la vía de la API. La duplica a propósito: las dos fallan por
 * motivos distintos y ninguna base debería depender de una sola.
 *
 * Se acumula un día a la vez, sin reescribir lo ya guardado. Un precio que la
 * bolsa publicó no es nuestro para revisarlo.
 *
 * Correr con `yarn stablecoins:collect`.
 */

const SEED = join('src', 'database', 'seeds', 'boot', 'stablecoin-books.json');
const URL = 'https://p2p.binance.com/bapi/c2c/v2/friendly/c2c/adv/search';

/**
 * Cuántos días se conservan en la semilla.
 *
 * No es una ventana de lectura, es un tope de tamaño. La serie larga vive en la
 * base; esto es el puente para que un arranque en limpio no empiece vacío, y
 * dos meses son de sobra para eso. Sin tope, el fichero crece con diez
 * lecturas al día para siempre dentro del repositorio.
 */
const KEEP_DAYS = 60;

/** La fecha local de La Paz, que es la que fecha la lectura. */
function localDate(at: Date): string {
  return new Intl.DateTimeFormat('en-CA', {
    timeZone: 'America/La_Paz',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).format(at);
}

async function readBook(
  asset: StablecoinAsset,
  side: BookSide,
  eventDate: string,
  retrievedAt: string,
): Promise<StablecoinBookSeedQuote | null> {
  const body = JSON.stringify({
    asset,
    fiat: 'BOB',
    tradeType: BOOK_SIDE_REQUEST[side],
    page: 1,
    rows: BOOK_DEPTH,
  });
  const response = await fetch(URL, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body,
  });
  const text = await response.text();
  if (!response.ok) throw new Error(`La bolsa respondió ${response.status} para ${asset}/${side}`);

  let quote;
  try {
    quote = parseStablecoinBook(text, side, asset);
  } catch (error) {
    // Un libro vacío es el estado del mercado, no una avería: tres de las cinco
    // fichas que se piden no se negocian en bolivianos y así llegan cada vez.
    if (error instanceof EmptyBookError) {
      console.log(`  ${asset.padEnd(6)} ${side.padEnd(5)} libro vacío`);
      return null;
    }
    throw error;
  }

  const measure = stablecoinBookMeasure(quote);
  console.log(
    `  ${asset.padEnd(6)} ${side.padEnd(5)} ${measure.value.padStart(7)} ${measure.unit}` +
      `  (${quote.advertisementsRead} de ${quote.advertisementsTotal ?? '?'} avisos)`,
  );
  return {
    indicatorCode: measure.indicatorCode,
    asset: quote.asset,
    priceSide: side,
    eventDate,
    value: measure.value,
    unit: measure.unit,
    advertisementsRead: quote.advertisementsRead,
    /*
     * La porción literal de la respuesta de la que salió el precio, igual que
     * en la vía de la API y con el mismo tope de 4.000. Un aviso completo mide
     * entre 2,3 y 3,4 kB, así que entra entero; el recorte es solo el guardián
     * que impide escribir una semilla que su propio esquema rechazaría. Nunca
     * se reconstruye: los bytes citados tienen que ser los que se leyeron.
     */
    excerpt: quote.excerpt.slice(0, 4_000),
    sourceUrl: URL,
    documentSha256: createHash('sha256').update(text).digest('hex'),
    retrievedAt,
  };
}

async function main(): Promise<void> {
  const at = new Date();
  const eventDate = localDate(at);
  const retrievedAt = `${at.toISOString().slice(0, 19)}Z`;
  console.log(`Libros en bolivianos, ${eventDate}:`);

  const found: StablecoinBookSeedQuote[] = [];
  let unreadable = 0;
  let asked = 0;
  for (const asset of Object.keys(STABLECOIN_SERIES) as StablecoinAsset[]) {
    for (const side of ['SELL', 'BUY'] as const) {
      asked += 1;
      try {
        const quote = await readBook(asset, side, eventDate, retrievedAt);
        if (quote) found.push(quote);
      } catch (error) {
        unreadable += 1;
        console.warn(`  ${asset}/${side}: ${error instanceof Error ? error.message : 'falló'}`);
      }
    }
  }
  // Que todos los libros estén ilegibles es la bolsa rechazando la petición, y
  // eso sí es un fallo. Que estén vacíos, no.
  if (unreadable === asked) throw new Error('Ningún libro pudo leerse');

  const held: StablecoinBookSeedQuote[] = existsSync(SEED)
    ? ((JSON.parse(readFileSync(SEED, 'utf-8')) as { quotes?: StablecoinBookSeedQuote[] }).quotes ??
      [])
    : [];
  const key = (quote: StablecoinBookSeedQuote) =>
    `${quote.indicatorCode}|${quote.priceSide}|${quote.eventDate}`;
  const seen = new Set(held.map(key));
  const added = found.filter((quote) => !seen.has(key(quote)));

  const floor = localDate(new Date(at.getTime() - KEEP_DAYS * 86_400_000));
  const quotes = [...held, ...added]
    .filter((quote) => quote.eventDate >= floor)
    .sort((left, right) => key(left).localeCompare(key(right)));

  if (!quotes.length) throw new Error('La semilla quedaría vacía; no se escribe');
  writeFileSync(SEED, `${JSON.stringify({ quotes }, null, 2)}\n`, 'utf-8');
  console.log(
    `\n${added.length} lecturas nuevas; ${quotes.length} en la semilla desde ${quotes[0]?.eventDate}`,
  );
}

main().catch((error: unknown) => {
  process.stderr.write(
    `${error instanceof Error ? error.message : 'La captura de libros falló'}\n`,
  );
  process.exitCode = 1;
});
