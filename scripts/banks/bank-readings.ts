import { createHash } from 'node:crypto';
import type {
  BankPoint,
  BankSeries,
} from '../../src/database/seeds/schemas/bank-virtual-assets.schema';
import { ANCHORS } from './bank-anchors';
import {
  LIMIT_SERIES,
  OFFERED_SERIES,
  QUOTE_SERIES,
  type BankPage,
  type QuoteFeed,
  type SeriesSpec,
} from './bank-sources';

/**
 * La lógica pura de la lectura de los bancos, aparte del colector para poder
 * probarla sin salir a la red.
 */

const MINIMUM_BYTES = 4_000;

const sha256 = (input: Buffer | string): string => createHash('sha256').update(input).digest('hex');

/** La fecha de hoy en La Paz (UTC-4 todo el año), que es la que cuenta el banco. */
export const laPazDate = (now: Date): string =>
  new Intl.DateTimeFormat('en-CA', { timeZone: 'America/La_Paz' }).format(now);

/** El texto que ve quien abre la página: sin scripts, estilos ni marcado. */
export function visibleText(html: string): string {
  return html
    .replace(/<(script|style|noscript)\b[\s\S]*?<\/\1>/giu, ' ')
    .replace(/<[^>]+>/gu, ' ')
    .replace(/&nbsp;/gu, ' ')
    .replace(/\s+/gu, ' ')
    .trim();
}

/** «10,000» y «10.000» son diez mil; «2,5» y «2.5» son dos y medio. */
export function plainAmount(text: string): string | null {
  if (/^\d{1,3}(?:[.,]\d{3})+$/u.test(text)) return text.replace(/[.,]/gu, '');
  if (/^\d+[.,]\d+$/u.test(text)) return text.replace(',', '.');
  return /^\d+$/u.test(text) ? text : null;
}

/**
 * Los bancos sirven UTF-8 o Windows-1252 según el sitio, y no siempre lo
 * declaran: se prueba UTF-8 estricto y, si los bytes no lo son, el otro. Leer
 * Windows-1252 como UTF-8 deja un carácter de sustitución en cada tilde, y esa
 * cita se guardaría rota.
 */
export function decodePage(bytes: Buffer): string {
  try {
    return new TextDecoder('utf-8', { fatal: true }).decode(bytes);
  } catch {
    return new TextDecoder('windows-1252').decode(bytes);
  }
}

/** La etiqueta completa que contiene el pasaje, si el anuncio es una imagen. */
function enclosingTag(html: string, index: number): string {
  const open = html.lastIndexOf('<', index);
  const close = html.indexOf('>', index);
  return html
    .slice(open < 0 ? index : open, close < 0 ? index + 120 : close + 1)
    .replace(/\s+/gu, ' ');
}

const around = (text: string, index: number, length: number): string =>
  text.slice(Math.max(0, index - 60), Math.min(text.length, index + length + 120)).trim();

function excerptOf(page: BankPage, haystack: string, found: RegExpExecArray): string {
  return page.haystack === 'html'
    ? enclosingTag(haystack, found.index)
    : around(haystack, found.index, found[0].length);
}

export interface Reading {
  readonly indicatorCode: string;
  readonly point: BankPoint;
}

export function readPage(page: BankPage, bytes: Buffer, today: string, now: Date): Reading[] {
  const html = decodePage(bytes);
  const text = visibleText(html);
  if (bytes.length < MINIMUM_BYTES || !page.identity.test(text + html)) {
    throw new Error('la respuesta no es la página del banco');
  }
  const provenance = {
    date: today,
    basis: 'OFFICIAL_PAGE' as const,
    sourceUrl: page.url,
    upstreamSha256: sha256(bytes),
    retrievedAt: now.toISOString().replace(/\.\d{3}Z$/u, 'Z'),
  };
  const haystack = page.haystack === 'html' ? html : text;
  const found = page.marker.exec(haystack);
  const code = OFFERED_SERIES.find((spec) => spec.bank === page.bank)?.indicatorCode;
  if (!code) throw new Error(`no hay serie para ${page.bank}`);
  const readings: Reading[] = [
    {
      indicatorCode: code,
      point: {
        ...provenance,
        value: found ? '1' : '0',
        excerpt: found
          ? excerptOf(page, haystack, found)
          : `la página responde y el pasaje ${page.marker.source} ya no aparece`,
      },
    },
  ];
  if (!found) return readings;
  for (const limit of page.limits ?? []) {
    const match = limit.pattern.exec(text);
    const value = match?.[limit.group] ? plainAmount(match[limit.group] ?? '') : null;
    if (match && value) {
      readings.push({
        indicatorCode: limit.indicatorCode,
        point: { ...provenance, value, excerpt: match[0] },
      });
    }
  }
  return readings;
}

/** El valor de una etiqueta del bloque, sin importar el prefijo de espacio de nombres. */
function tagValue(block: string, tag: string): string | null {
  const found = new RegExp(`<(?:\\w+:)?${tag}>\\s*([^<]*?)\\s*</(?:\\w+:)?${tag}>`, 'u').exec(block);
  return found?.[1] ?? null;
}

/**
 * La cotización que un banco sirve en su archivo público, con los lados del
 * cliente.
 *
 * El banco dice «compra» y «venta» desde su punto de vista: `ValorCompra` es lo
 * que paga al comprarle USDT al cliente —lo que el cliente RECIBE— y
 * `ValorVenta` lo que cobra al vendérselo —lo que el cliente PAGA—. Un archivo
 * que no trae la moneda, o que trae un precio que no es un precio, no escribe
 * nada: la cifra de ayer no se repite ni se inventa.
 */
export function readQuoteFeed(
  feed: QuoteFeed,
  bytes: Buffer,
  today: string,
  now: Date,
  sourceUrl: string = feed.url,
): Reading[] {
  if (feed.format === 'TICKER') return readQuoteTicker(feed, bytes, today, now, sourceUrl);
  const xml = decodePage(bytes);
  const blocks = xml.match(/<(?:\w+:)?Cotizacion>[\s\S]*?<\/(?:\w+:)?Cotizacion>/gu) ?? [];
  const block = blocks.find(
    (one) =>
      tagValue(one, 'Moneda') === feed.currency && tagValue(one, 'MonedaCambio') === feed.against,
  );
  if (!block) throw new Error(`el archivo no trae ${feed.currency}/${feed.against}`);
  const bankBuys = plainAmount(tagValue(block, 'ValorCompra') ?? '');
  const bankSells = plainAmount(tagValue(block, 'ValorVenta') ?? '');
  if (!bankBuys || !bankSells || Number(bankBuys) < 1 || Number(bankSells) < 1) {
    throw new Error(
      `${feed.currency}/${feed.against} no trae una compra y una venta en bolivianos`,
    );
  }
  return quoteReadings(
    feed.bank,
    [
      ['CLIENT_BUYS', bankSells],
      ['CLIENT_SELLS', bankBuys],
    ],
    {
      date: today,
      basis: 'OFFICIAL_FEED',
      excerpt: block.replace(/\s+/gu, ' '),
      sourceUrl,
      upstreamSha256: sha256(bytes),
      retrievedAt: now.toISOString().replace(/\.\d{3}Z$/u, 'Z'),
    },
  );
}

/** Los dos lados de la cotización de un banco, ya dichos desde el cliente. */
function quoteReadings(
  bank: string,
  sides: ReadonlyArray<readonly ['CLIENT_BUYS' | 'CLIENT_SELLS', string]>,
  provenance: Omit<BankPoint, 'value'>,
): Reading[] {
  const offered = OFFERED_SERIES.find((spec) => spec.bank === bank);
  return sides.map(([side, value]) => {
    const series = QUOTE_SERIES.find(
      (spec) => spec.bank === bank && spec.asset === offered?.asset && spec.side === side,
    );
    if (!series) throw new Error(`no hay serie de cotización para ${bank}`);
    return { indicatorCode: series.indicatorCode, point: { ...provenance, value } };
  });
}

/**
 * La cotización que un banco escribe en la cinta de su portada.
 *
 * Se lee del texto visible, que junta «USDT Venta: 12.20 | USDT Compra: 11.90»
 * aunque el marcado los separe en etiquetas; la cita es ese tramo, tal cual. Una
 * página que no trae la cinta —un error, un cartel de mantenimiento, una
 * captura vieja que no la tenía— no escribe nada.
 */
function readQuoteTicker(
  feed: Extract<QuoteFeed, { format: 'TICKER' }>,
  bytes: Buffer,
  today: string,
  now: Date,
  sourceUrl: string,
): Reading[] {
  const text = visibleText(decodePage(bytes));
  const pattern = new RegExp(`${feed.label} (Venta|Compra):\\s*(\\d+(?:[.,]\\d+)?)`, 'gu');
  const found = [...text.matchAll(pattern)];
  const sides: Array<readonly ['CLIENT_BUYS' | 'CLIENT_SELLS', string]> = [];
  for (const [bankSide, side] of [
    ['Venta', 'CLIENT_BUYS'],
    ['Compra', 'CLIENT_SELLS'],
  ] as const) {
    const match = found.find((one) => one[1] === bankSide);
    if (!match) continue;
    const value = plainAmount(match[2] ?? '');
    if (!value || Number(value) < 1 || Number(value) > 100) {
      throw new Error(`${feed.label} ${bankSide} no es un precio en bolivianos: «${match[0]}»`);
    }
    sides.push([side, value]);
  }
  if (!sides.length) throw new Error(`la página no trae la cotización de ${feed.label}`);
  const start = Math.min(...found.map((one) => one.index ?? 0));
  const end = Math.max(...found.map((one) => (one.index ?? 0) + one[0].length));
  return quoteReadings(feed.bank, sides, {
    date: today,
    basis: 'OFFICIAL_FEED',
    excerpt: text.slice(start, end),
    sourceUrl,
    upstreamSha256: sha256(bytes),
    retrievedAt: now.toISOString().replace(/\.\d{3}Z$/u, 'Z'),
  });
}

function emptySeed(): BankSeries[] {
  return [...OFFERED_SERIES, ...LIMIT_SERIES, ...QUOTE_SERIES].map((spec: SeriesSpec) => {
    const anchor = ANCHORS[spec.indicatorCode];
    return { ...spec, points: anchor ? [anchor] : [] };
  });
}

/** Lo que ya había, con las series nuevas de la definición y sin perder un día. */
export function mergeSeed(
  previous: readonly BankSeries[],
  readings: readonly Reading[],
): BankSeries[] {
  const base = new Map(previous.map((series) => [series.indicatorCode, series]));
  const merged = emptySeed().map((fresh) => {
    const kept = base.get(fresh.indicatorCode);
    const points = new Map((kept?.points ?? fresh.points).map((point) => [point.date, point]));
    for (const anchor of fresh.points)
      if (!points.has(anchor.date)) points.set(anchor.date, anchor);
    for (const reading of readings) {
      if (reading.indicatorCode !== fresh.indicatorCode) continue;
      // Una segunda corrida del mismo día que ve lo mismo no reescribe el
      // punto: cambiaría la semilla, y con ella el despliegue, por nada.
      if (points.get(reading.point.date)?.value === reading.point.value) continue;
      points.set(reading.point.date, reading.point);
    }
    return { ...fresh, points: [...points.values()].sort((a, b) => a.date.localeCompare(b.date)) };
  });
  return merged.filter((series) => series.points.length > 0);
}
