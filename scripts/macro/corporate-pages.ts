import { createHash } from 'node:crypto';
import { USER_AGENT } from './corporate-sources';

/**
 * Cómo se lee una lista publicada en una página: bajarla, desnudarla, extraerla.
 *
 * Separado del colector por la misma razón que el lector de cuadernos del INE:
 * el colector sabe qué significa una posición y esto sólo sabe encontrarla.
 * Las dos fuentes de este capítulo publican en HTML corriente pero no igual:
 * Datasur imprime cada fila como una línea de texto seguido, y Merco como una
 * tabla con una celda por dato. Por eso hay dos lecturas y no una.
 */

const ATTEMPTS = 4;

const sleep = (milliseconds: number): Promise<void> =>
  new Promise((resolve) => setTimeout(resolve, milliseconds));

/** Las entidades que estas dos páginas usan, devueltas a su carácter. */
function decode(html: string): string {
  return html
    .replace(/&nbsp;/gu, ' ')
    .replace(/&amp;/gu, '&')
    .replace(/&quot;/gu, '"')
    .replace(/&#(\d+);/gu, (_match, code: string) => String.fromCodePoint(Number(code)))
    .replace(/&[a-z]+;/giu, ' ');
}

/**
 * El texto de una página, sin su maquetación.
 *
 * No se usa un analizador de HTML a propósito: lo que se busca son secuencias
 * de texto contiguo —«3 EXPORTACIONES DE INDUSTRIAS DE ACEITE 2.304.252.337
 * 5,5%»— y un árbol de nodos las devolvería partidas por las celdas que las
 * contienen, que es justo lo que hay que volver a unir.
 */
export function readable(html: string): string {
  return decode(
    html
      .replace(/<script[\s\S]*?<\/script>/giu, ' ')
      .replace(/<style[\s\S]*?<\/style>/giu, ' ')
      .replace(/<[^>]+>/gu, ' '),
  )
    .replace(/\s+/gu, ' ')
    .trim();
}

/** La página tal como llegó, con su huella. */
export async function fetchHtml(
  url: string,
  cookie?: string,
): Promise<{ html: string; sha256: string }> {
  let failure = 'sin intentos';
  for (let attempt = 1; attempt <= ATTEMPTS; attempt += 1) {
    try {
      const response = await fetch(url, {
        headers: { 'User-Agent': USER_AGENT, ...(cookie ? { Cookie: cookie } : {}) },
        signal: AbortSignal.timeout(45_000),
      });
      if (response.ok) {
        const bytes = Buffer.from(await response.arrayBuffer());
        return {
          html: bytes.toString('utf-8'),
          sha256: createHash('sha256').update(bytes).digest('hex'),
        };
      }
      failure = `respondió ${response.status}`;
    } catch (error: unknown) {
      failure = error instanceof Error ? error.message : 'fallo de red';
    }
    await sleep(1_500 * attempt);
  }
  throw new Error(`${url}: ${failure} tras ${ATTEMPTS} intentos`);
}

export async function fetchPage(url: string): Promise<{ text: string; sha256: string }> {
  const { html, sha256 } = await fetchHtml(url);
  return { text: readable(html), sha256 };
}

const cell = (html: string): string => decode(html.replace(/<[^>]+>/gu, ' ')).replace(/\s+/gu, ' ').trim();

/** Un puesto del ránking general de Merco, con su puntuación. */
export interface MercoSeat {
  readonly rank: number;
  readonly company: string;
  readonly score: number;
}

/** Un puesto dentro de un sector, en la misma edición. */
export interface MercoSectorSeat {
  readonly sector: string;
  readonly rank: number;
  readonly company: string;
}

/**
 * Los dos cuadros de una edición de Merco: el general y el sectorial.
 *
 * La página imprime el ránking dos veces —una maquetación de escritorio y otra
 * de móvil— y aquí se lee sólo la primera, entre `ranking-desktop` y
 * `ranking-mobile`. Leer las dos duplicaría cada puesto.
 *
 * Dentro de ella, el general vive entre `ranking-empresas` y
 * `ranking-sectorial`, y el sectorial entre ese y `ranking-documentos`. Cada
 * sector abre con su rótulo en un `<h3>` y debajo lleva su propia tabla.
 */
export function mercoTables(html: string): {
  general: MercoSeat[];
  sectors: MercoSectorSeat[];
} {
  const between = (from: string, to: string): string => {
    const start = html.indexOf(from);
    const end = html.indexOf(to, start + from.length);
    if (start < 0 || end < 0) throw new Error(`la página de Merco ya no trae «${from}»`);
    return html.slice(start, end);
  };

  const generalBlock = between('id="ranking-empresas"', 'id="ranking-sectorial"');
  const general: MercoSeat[] = [];
  for (const row of generalBlock.matchAll(/<tr>([\s\S]*?)<\/tr>/gu)) {
    const cells = [...(row[1] ?? '').matchAll(/<td[^>]*>([\s\S]*?)<\/td>/gu)].map((match) =>
      cell(match[1] ?? ''),
    );
    const rank = Number(cells[0]);
    const score = Number(cells[2]);
    if (cells.length >= 3 && Number.isInteger(rank) && Number.isFinite(score) && cells[1]) {
      general.push({ rank, company: cells[1], score });
    }
  }

  const sectorBlock = between('id="ranking-sectorial"', 'id="ranking-documentos"');
  const sectors: MercoSectorSeat[] = [];
  for (const part of sectorBlock.split(/<h3[^>]*>/u).slice(1)) {
    const sector = cell(part.slice(0, part.indexOf('</h3>')));
    for (const row of part.matchAll(/<tr>([\s\S]*?)<\/tr>/gu)) {
      const cells = [...(row[1] ?? '').matchAll(/<td[^>]*>([\s\S]*?)<\/td>/gu)].map((match) =>
        cell(match[1] ?? ''),
      );
      const rank = Number(cells[0]);
      if (sector && cells[1] && Number.isInteger(rank)) {
        sectors.push({ sector, rank, company: cells[1] });
      }
    }
  }

  return { general, sectors };
}
