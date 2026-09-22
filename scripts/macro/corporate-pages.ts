import { createHash } from 'node:crypto';
import { USER_AGENT } from './corporate-sources';

/**
 * Cómo se lee una lista publicada en una página: bajarla, desnudarla, extraerla.
 *
 * Separado del colector por la misma razón que el lector de cuadernos del INE:
 * el colector sabe qué significa una posición y esto sólo sabe encontrarla. Las
 * dos fuentes de este capítulo publican en HTML corriente y las dos numeran sus
 * puestos igual —«(4º)»—, así que una sola extracción sirve para el ránking de
 * exportadoras y para los dos de reputación.
 */

const ATTEMPTS = 4;

const sleep = (milliseconds: number): Promise<void> =>
  new Promise((resolve) => setTimeout(resolve, milliseconds));

/**
 * El texto de una página, sin su maquetación.
 *
 * No se usa un analizador de HTML a propósito: lo que se busca son secuencias
 * de texto contiguo —«3 EXPORTACIONES DE INDUSTRIAS DE ACEITE 2.304.252.337
 * 5,5%»— y un árbol de nodos las devolvería partidas por las celdas que las
 * contienen, que es justo lo que hay que volver a unir.
 */
export function readable(html: string): string {
  return html
    .replace(/<script[\s\S]*?<\/script>/giu, ' ')
    .replace(/<style[\s\S]*?<\/style>/giu, ' ')
    .replace(/<[^>]+>/gu, ' ')
    .replace(/&nbsp;/gu, ' ')
    .replace(/&amp;/gu, '&')
    .replace(/&quot;/gu, '"')
    .replace(/&#(\d+);/gu, (_match, code: string) => String.fromCodePoint(Number(code)))
    .replace(/&[a-z]+;/giu, ' ')
    .replace(/\s+/gu, ' ')
    .trim();
}

export async function fetchPage(url: string): Promise<{ text: string; sha256: string }> {
  let failure = 'sin intentos';
  for (let attempt = 1; attempt <= ATTEMPTS; attempt += 1) {
    try {
      const response = await fetch(url, {
        headers: { 'User-Agent': USER_AGENT },
        signal: AbortSignal.timeout(45_000),
      });
      if (response.ok) {
        const bytes = Buffer.from(await response.arrayBuffer());
        return {
          text: readable(bytes.toString('utf-8')),
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

/** El tramo entre dos rótulos de la página, que es donde vive un cuadro. */
export function pageSlice(text: string, from: string, to: string, what: string): string {
  const start = text.indexOf(from);
  if (start < 0) throw new Error(`${what}: no se encontró «${from}» en la página`);
  const after = start + from.length;
  const end = text.indexOf(to, after);
  if (end < 0) throw new Error(`${what}: no se encontró «${to}» tras «${from}»`);
  return text.slice(after, end);
}

/**
 * Dónde acaba el texto de relleno y empieza el nombre de una empresa.
 *
 * Una coma, un punto y coma, dos puntos, un «y» suelto, o uno de los tres
 * verbos con que estos artículos encadenan posiciones. Y también un punto
 * final, pero **sólo el que cierra una frase**: el que va detrás de una
 * mayúscula es una abreviatura —«Sofía LTDA.», «Droguería INTI S.A.»— y cortar
 * ahí dejaba el nombre en nada. Fue el fallo de la primera corrida: ocho
 * posiciones de diez, y las dos que faltaban eran justo las dos con razón
 * social abreviada.
 */
const NAME_STARTS_AFTER =
  /[,;:]\s+|(?<=[a-záéíóúñ0-9])\.\s+|\b(?:completan|seguida de|seguido de)\s+|\s+y\s+/gu;

/**
 * Las posiciones que un tramo de prosa o de cuadro numera con «(4º)».
 *
 * El nombre es lo que hay entre el marcador anterior y este, recortado por el
 * último separador que aparezca; si no aparece ninguno, el tramo entero es el
 * nombre, que es el caso de las celdas de un cuadro sectorial.
 */
export function rankedNames(text: string): Array<{ rank: number; company: string }> {
  const out: Array<{ rank: number; company: string }> = [];
  let cursor = 0;
  for (const match of text.matchAll(/\((\d{1,2})º\)/gu)) {
    const before = text.slice(cursor, match.index);
    cursor = (match.index ?? 0) + match[0].length;
    const cuts = [...before.matchAll(NAME_STARTS_AFTER)];
    const last = cuts.at(-1);
    const company = (last ? before.slice((last.index ?? 0) + last[0].length) : before)
      .replace(/\s+/gu, ' ')
      .replace(/^[\s,.;:]+|[\s,;:]+$/gu, '')
      /*
       * La conjunción de la última posición.
       *
       * «…, y Droguería INTI S.A. (10º)» corta por la coma y deja la «y»
       * pegada al nombre, porque el separador que la habría quitado exige un
       * espacio delante y ese espacio ya se lo llevó la coma. Se quita aquí, al
       * final, que es donde se ve.
       */
      .replace(/^(?:y|e)\s+/iu, '')
      // Un punto suelto que quedó separado del nombre por un espacio.
      .replace(/\s+\.$/u, '')
      .trim();
    const rank = Number(match[1]);
    if (company.length >= 3 && Number.isFinite(rank)) out.push({ rank, company });
  }
  return out;
}

/**
 * Que una frase citada siga estando en la página.
 *
 * Se compara sin tildes ni dobles espacios, porque la misma frase viaja con un
 * guion distinto o un espacio de más según quién republique el artículo, y eso
 * no cambia lo que afirma.
 */
export function pageStates(text: string, phrase: string): boolean {
  const plain = (value: string): string =>
    value.normalize('NFD').replace(/[̀-ͯ]/gu, '').replace(/\s+/gu, ' ').toLocaleLowerCase('es');
  return plain(text).includes(plain(phrase));
}
