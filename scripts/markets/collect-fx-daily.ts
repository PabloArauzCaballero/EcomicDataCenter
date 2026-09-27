import { createHash } from 'node:crypto';
import { existsSync, readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import type { FxDailyReading } from '../../src/database/seeds/schemas/fx-daily.schema';

/**
 * Acumula en una semilla el dólar oficial y el paralelo, un día cerrado a la vez.
 *
 * Las dos series solo llegaban por la API del recolector diario, que escribe en
 * la base de un servidor. El segundo despliegue se quedó con el dólar del día en
 * que se copió su base. Una semilla viaja en el repositorio y entra en cualquier
 * base al arrancar.
 *
 * La fuente es la misma de `fx-parallel-history` y `fx-official-history`, que
 * terminan el 23 de agosto de 2026: el promedio diario que publica Dólar Blue
 * Bolivia, con el paralelo (`bb`/`bs`) y el oficial del BCB (`ob`/`os`) en el
 * mismo objeto. Esto las continúa con la misma agregación.
 *
 * Solo entran días cerrados. El día en curso es un promedio a medias, y como el
 * archivo es de solo añadir, guardarlo dejaría fijo un valor que todavía cambia.
 *
 * Correr con `yarn fx:collect`.
 */

const SEED = join('src', 'database', 'seeds', 'boot', 'fx-daily.json');
const EXPORT = 'https://api.dolarbluebolivia.click/v1/chart/export';
const PUBLISHER = 'DOLAR BLUE BOLIVIA';
const UA = 'Mozilla/5.0 (compatible; ObservatorioEconomicoBO/1.0)';

/** El día siguiente al último de las semillas históricas. */
const FIRST_DAY = '2026-08-23';
/** Días que se vuelven a pedir antes del último guardado, por si la fuente tardó en cerrarlos. */
const OVERLAP_DAYS = 3;
/**
 * Días sin un solo dato nuevo a partir de los cuales se falla.
 *
 * La fuente publica todos los días, fines de semana incluidos. Si deja de
 * hacerlo, el lote tiene que ponerse en rojo: una semilla que no crece se ve
 * igual que una al día hasta que alguien mira la fecha.
 */
const STALE_AFTER_DAYS = 3;

const SERIES = [
  {
    indicatorCode: 'FX_PARALLEL_USD_BOB',
    label: 'Dolar paralelo',
    keys: { BUY: 'bb', SELL: 'bs' },
    originator: undefined,
  },
  {
    indicatorCode: 'FX_OFFICIAL_USD_BOB',
    label: 'Tipo de cambio oficial',
    keys: { BUY: 'ob', SELL: 'os' },
    originator: 'BANCO CENTRAL DE BOLIVIA',
  },
] as const;

const SIDES = ['BUY', 'SELL'] as const;

const day = (at: Date): string => at.toISOString().slice(0, 10);
const shift = (date: string, days: number): string =>
  day(new Date(Date.parse(`${date}T00:00:00Z`) + days * 86_400_000));

/** Plausible para bolivianos por dólar; fuera de esto es un error de la fuente. */
const plausible = (value: string): boolean => Number(value) > 1 && Number(value) < 100;

function readHeld(): FxDailyReading[] {
  if (!existsSync(SEED)) return [];
  return (JSON.parse(readFileSync(SEED, 'utf-8')) as { readings: FxDailyReading[] }).readings;
}

async function main(): Promise<void> {
  const held = readHeld();
  const key = (reading: Pick<FxDailyReading, 'indicatorCode' | 'priceSide' | 'eventDate'>) =>
    `${reading.indicatorCode}|${reading.priceSide}|${reading.eventDate}`;
  const seen = new Set(held.map(key));

  const today = day(new Date());
  const yesterday = shift(today, -1);
  const lastHeld = held.reduce(
    (latest, reading) => (reading.eventDate > latest ? reading.eventDate : latest),
    '',
  );
  const from = lastHeld ? shift(lastHeld, -OVERLAP_DAYS) : FIRST_DAY;

  const found: FxDailyReading[] = [];
  if (from <= yesterday) {
    const url = `${EXPORT}?from=${from}&to=${yesterday}&format=json&bucket=1d`;
    const response = await fetch(url, {
      headers: { 'User-Agent': UA },
      signal: AbortSignal.timeout(45_000),
    });
    const text = await response.text();
    if (!response.ok) throw new Error(`Dólar Blue Bolivia respondió ${response.status}`);
    const documentSha256 = createHash('sha256').update(text).digest('hex');
    const retrievedAt = `${new Date().toISOString().slice(0, 19)}Z`;
    const { data } = JSON.parse(text) as { data: Array<{ t: number }> };

    for (const { t } of data) {
      const eventDate = day(new Date(t * 1000));
      if (eventDate < FIRST_DAY || eventDate >= today) continue;
      // El objeto del día tal como viene escrito: la prueba cita la cifra
      // literal, sin pasarla por un número de coma flotante.
      const excerpt = text.match(new RegExp(`\\{[^{}]*"t":${t}[^{}]*\\}`, 'u'))?.[0];
      if (!excerpt) throw new Error(`El día ${eventDate} no aparece literal en la respuesta`);

      for (const series of SERIES) {
        for (const side of SIDES) {
          const reading = { indicatorCode: series.indicatorCode, priceSide: side, eventDate };
          if (seen.has(key(reading))) continue;
          const value = excerpt.match(
            new RegExp(`"${series.keys[side]}":(\\d+(?:\\.\\d+)?)`, 'u'),
          )?.[1];
          if (!value || !plausible(value)) {
            console.warn(
              `  ${series.indicatorCode} ${side} ${eventDate}: sin cifra plausible, omitido`,
            );
            continue;
          }
          found.push({
            ...reading,
            value,
            unit: 'BOB/USD',
            publisher: PUBLISHER,
            ...(series.originator ? { originator: series.originator } : {}),
            assertion: `${series.label} BOB/USD, promedio del ${eventDate}, ${side === 'BUY' ? 'compra' : 'venta'}: ${value} Bs.`,
            excerpt,
            sourceUrl: url,
            documentSha256,
            retrievedAt,
          });
          seen.add(key(reading));
          console.log(
            `  ${series.indicatorCode.padEnd(20)} ${side.padEnd(4)} ${eventDate}  ${value}`,
          );
        }
      }
    }
  }

  const readings = [...held, ...found].sort(
    (left, right) =>
      left.eventDate.localeCompare(right.eventDate) ||
      left.indicatorCode.localeCompare(right.indicatorCode) ||
      left.priceSide.localeCompare(right.priceSide),
  );
  if (!readings.length) throw new Error('Dólar Blue Bolivia no devolvió ningún día cerrado');
  writeFileSync(SEED, `${JSON.stringify({ readings }, null, 2)}\n`, 'utf-8');

  const newest = readings[readings.length - 1]?.eventDate ?? '';
  console.log(`${found.length} lecturas nuevas; la semilla llega al ${newest}`);
  if (newest < shift(yesterday, -STALE_AFTER_DAYS)) {
    throw new Error(
      `La semilla del dólar no avanza desde el ${newest}: la fuente dejó de publicar`,
    );
  }
}

main().catch((error: unknown) => {
  console.error(error instanceof Error ? error.message : error);
  process.exit(1);
});
