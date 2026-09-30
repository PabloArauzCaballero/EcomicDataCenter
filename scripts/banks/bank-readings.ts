import { createHash } from 'node:crypto';
import type {
  BankPoint,
  BankSeries,
} from '../../src/database/seeds/schemas/bank-virtual-assets.schema';
import { ANCHORS } from './bank-anchors';
import { LIMIT_SERIES, OFFERED_SERIES, type BankPage, type SeriesSpec } from './bank-sources';

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

function emptySeed(): BankSeries[] {
  return [...OFFERED_SERIES, ...LIMIT_SERIES].map((spec: SeriesSpec) => {
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
