import { createHash } from 'node:crypto';
import { existsSync, readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import {
  BOOK_DEPTH,
  BOOK_SIDE_REQUEST,
  EmptyBookError,
  STABLECOIN_SERIES,
  ThinBookError,
  parseStablecoinBook,
  type BookSide,
  type StablecoinAsset,
} from '../../src/modules/intelligence/stablecoin-book-parsers';
import {
  stablecoinBookAssertion,
  stablecoinBookMeasure,
} from '../../src/modules/intelligence/stablecoin-book-readings';
import {
  PairNotQuotedError,
  criptoyaAssertion,
  criptoyaSidePrice,
  parseCriptoyaRates,
} from '../../src/modules/intelligence/criptoya-rate-parsers';
import { INDICATOR_UNITS } from '../../src/modules/intelligence/indicator-measures';
import type { StablecoinBookSeedQuote } from '../../src/database/seeds/schemas/stablecoin-books.schema';

/**
 * Captura el precio en bolivianos de cada ficha estable y lo deja en una semilla.
 *
 * Dos fuentes y dos motivos distintos.
 *
 * **El libro entre particulares de la bolsa**, leído directo, que es el único
 * con profundidad: dice de cuántos avisos salió la mediana y cita el aviso
 * mismo como prueba.
 *
 * **Un agregador que cotiza la misma ficha en varias plazas**, que arregla un
 * defecto concreto: USDC se leía de una sola plaza, y una mediana entre plazas
 * con una sola plaza no es una mediana, es esa plaza.
 *
 * Y la semilla en sí arregla otro: estas lecturas solo llegaban a una base,
 * porque el recolector diario las publica por la API de un servidor. Una
 * semilla viaja en el repositorio y entra al arrancar, dondequiera que arranque.
 *
 * Se acumula un día a la vez, sin reescribir lo ya guardado. Un precio que una
 * plaza publicó no es nuestro para revisarlo.
 *
 * Correr con `yarn stablecoins:collect`.
 */

const SEED = join('src', 'database', 'seeds', 'boot', 'stablecoin-books.json');
const BOOK_URL = 'https://p2p.binance.com/bapi/c2c/v2/friendly/c2c/adv/search';
const BOOK_VENUE = 'BINANCE P2P';
const AGGREGATOR = 'https://criptoya.com/api';
const AGGREGATOR_PUBLISHER = 'CRIPTOYA';
const SIDES = ['SELL', 'BUY'] as const;

/**
 * Cuántos días se conservan en la semilla.
 *
 * Es un tope de tamaño, no una ventana de lectura. La serie larga vive en la
 * base; esto es el puente para que un arranque en limpio no empiece vacío.
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

interface Stamp {
  eventDate: string;
  retrievedAt: string;
}

async function readBook(
  asset: StablecoinAsset,
  side: BookSide,
  stamp: Stamp,
): Promise<StablecoinBookSeedQuote | null> {
  const response = await fetch(BOOK_URL, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      asset,
      fiat: 'BOB',
      tradeType: BOOK_SIDE_REQUEST[side],
      page: 1,
      rows: BOOK_DEPTH,
    }),
  });
  const text = await response.text();
  if (!response.ok) throw new Error(`La bolsa respondió ${response.status} para ${asset}/${side}`);

  let quote;
  try {
    quote = parseStablecoinBook(text, side, asset);
  } catch (error) {
    // Un libro vacío, o demasiado fino para tener mediana, es el estado del
    // mercado y no una avería: de las fichas que se piden, varias llegan así
    // cada vez.
    if (error instanceof EmptyBookError || error instanceof ThinBookError) {
      const why =
        error instanceof ThinBookError
          ? `solo ${error.advertisementsRead} aviso(s)`
          : 'libro vacío';
      console.log(`  ${asset.padEnd(6)} ${side.padEnd(5)} ${BOOK_VENUE.padEnd(12)} ${why}`);
      return null;
    }
    throw error;
  }

  const measure = stablecoinBookMeasure(quote);
  console.log(
    `  ${asset.padEnd(6)} ${side.padEnd(5)} ${BOOK_VENUE.padEnd(12)} ${measure.value.padStart(8)}` +
      `  (${quote.advertisementsRead} de ${quote.advertisementsTotal ?? '?'} avisos)`,
  );
  return {
    indicatorCode: measure.indicatorCode,
    asset: quote.asset,
    priceSide: side,
    eventDate: stamp.eventDate,
    value: measure.value,
    unit: measure.unit,
    venue: BOOK_VENUE,
    publisher: BOOK_VENUE,
    advertisementsRead: quote.advertisementsRead,
    assertion: stablecoinBookAssertion(quote),
    // El tope es el mismo que acepta la ingesta por la API: las dos vías
    // guardan la misma prueba y una no puede admitir lo que la otra rechaza.
    excerpt: quote.excerpt.slice(0, 4_000),
    sourceUrl: BOOK_URL,
    documentSha256: createHash('sha256').update(text).digest('hex'),
    retrievedAt: stamp.retrievedAt,
  };
}

/**
 * Lee la misma ficha en el agregador, una fila por plaza y lado.
 *
 * Las plazas se escriben en mayúsculas para que convivan con `BINANCE P2P` en
 * la misma columna del modelo de lectura, que agrupa por texto exacto. El
 * nombre tal como lo deletrea la respuesta sigue dentro del extracto, que es lo
 * que se cita.
 */
async function readAggregator(
  asset: StablecoinAsset,
  stamp: Stamp,
): Promise<StablecoinBookSeedQuote[]> {
  const url = `${AGGREGATOR}/${asset.toLocaleLowerCase('en')}/bob/1`;
  const response = await fetch(url);
  const text = await response.text();
  /*
   * El 422 de este agregador es «no cotizo ese par», no una avería. Lo dice
   * así para tres de las cinco fichas que se piden, en cada corrida, porque
   * esas tres no se negocian en bolivianos en ninguna parte.
   */
  if (response.status === 422) throw new PairNotQuotedError(asset);
  if (!response.ok) throw new Error(`El agregador respondió ${response.status} para ${asset}`);

  const { quotes, rejected } = parseCriptoyaRates(text, asset);
  for (const [venue, reason] of Object.entries(rejected)) {
    console.log(`  ${asset.padEnd(6)} ${'—'.padEnd(5)} ${venue.padEnd(12)} descartada: ${reason}`);
  }

  const sha256 = createHash('sha256').update(text).digest('hex');
  return quotes.flatMap((quote) =>
    SIDES.map((side) => {
      const value = criptoyaSidePrice(quote, side);
      console.log(
        `  ${asset.padEnd(6)} ${side.padEnd(5)} ${quote.venue.padEnd(12)} ${value.padStart(8)}`,
      );
      return {
        indicatorCode: STABLECOIN_SERIES[asset],
        asset,
        priceSide: side,
        eventDate: stamp.eventDate,
        value,
        unit: INDICATOR_UNITS.bolivianosPerDollar,
        venue: quote.venue.toLocaleUpperCase('en'),
        publisher: AGGREGATOR_PUBLISHER,
        assertion: criptoyaAssertion(quote, asset, side),
        excerpt: quote.excerpt.slice(0, 4_000),
        sourceUrl: url,
        documentSha256: sha256,
        retrievedAt: stamp.retrievedAt,
      };
    }),
  );
}

async function collect(
  stamp: Stamp,
): Promise<{ found: StablecoinBookSeedQuote[]; failed: number }> {
  const found: StablecoinBookSeedQuote[] = [];
  let failed = 0;
  for (const asset of Object.keys(STABLECOIN_SERIES) as StablecoinAsset[]) {
    for (const side of SIDES) {
      try {
        const quote = await readBook(asset, side, stamp);
        if (quote) found.push(quote);
      } catch (error) {
        failed += 1;
        console.warn(`  ${asset}/${side}: ${error instanceof Error ? error.message : 'falló'}`);
      }
    }
    try {
      found.push(...(await readAggregator(asset, stamp)));
    } catch (error) {
      // Que el agregador no cotice la ficha es mercado, no avería, igual que un
      // libro vacío. Se anota y no cuenta como fallo.
      if (error instanceof PairNotQuotedError) {
        console.log(
          `  ${asset.padEnd(6)} ${'—'.padEnd(5)} ${AGGREGATOR_PUBLISHER.padEnd(12)} no cotiza el par`,
        );
        continue;
      }
      failed += 1;
      console.warn(`  ${asset}/agregador: ${error instanceof Error ? error.message : 'falló'}`);
    }
  }
  return { found, failed };
}

async function main(): Promise<void> {
  const at = new Date();
  const stamp = { eventDate: localDate(at), retrievedAt: `${at.toISOString().slice(0, 19)}Z` };
  console.log(`Fichas estables en bolivianos, ${stamp.eventDate}:`);

  const { found } = await collect(stamp);
  // Que no salga ni una lectura es la señal de que algo se rompió de verdad;
  // que falten algunas es el mercado, que no cotiza todo en todas partes.
  if (!found.length) throw new Error('Ninguna fuente devolvió una cotización');

  const held: StablecoinBookSeedQuote[] = existsSync(SEED)
    ? ((JSON.parse(readFileSync(SEED, 'utf-8')) as { quotes?: StablecoinBookSeedQuote[] }).quotes ??
      [])
    : [];
  const key = (quote: StablecoinBookSeedQuote) =>
    `${quote.indicatorCode}|${quote.venue}|${quote.priceSide}|${quote.eventDate}`;
  const seen = new Set(held.map(key));
  const added = found.filter((quote) => !seen.has(key(quote)));

  const floor = localDate(new Date(at.getTime() - KEEP_DAYS * 86_400_000));
  const quotes = [...held, ...added]
    .filter((quote) => quote.eventDate >= floor)
    .sort((left, right) => key(left).localeCompare(key(right)));

  if (!quotes.length) throw new Error('La semilla quedaría vacía; no se escribe');
  writeFileSync(SEED, `${JSON.stringify({ quotes }, null, 2)}\n`, 'utf-8');
  const venues = new Set(added.map((quote) => quote.venue));
  console.log(
    `\n${added.length} lecturas nuevas de ${venues.size} plazas; ` +
      `${quotes.length} en la semilla desde ${quotes[0]?.eventDate}`,
  );
}

main().catch((error: unknown) => {
  process.stderr.write(`${error instanceof Error ? error.message : 'La captura falló'}\n`);
  process.exitCode = 1;
});
