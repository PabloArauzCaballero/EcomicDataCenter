import type { Glyph, PdfRow } from './pdf-rows';

/**
 * La geometría que comparten los cuadros de las memorias de Impuestos.
 *
 * Quince ediciones, quince maquetaciones: la columna del departamento se mueve
 * entre páginas pares e impares, unas ediciones parten las palabras en letras
 * sueltas y otras escriben cada palabra como un trozo aparte, y la cifra de una
 * fila a veces cae una línea más abajo que su nombre. Nada de eso se arregla con
 * tramos de `x` fijos escritos a mano; se arregla leyendo cada página: las
 * columnas de cifras salen de dónde están las cifras de esa página, y una línea
 * suelta se cuelga de la fila con número que tiene más cerca en altura.
 */

/** Un trozo que es parte de una cifra: dígitos, separadores, el signo de por ciento. */
export const isFigure = (text: string): boolean =>
  /^[-\d.,%\uFFFD\s*]+$/u.test(text) && /[\d\uFFFD]/u.test(text);

/** Un trozo que es una cifra entera y no un pedazo de una. */
export const isWholeFigure = (text: string): boolean => /^-?\d[\d.,\s]*%?\*?$/u.test(text.trim());

/**
 * Une los trozos de una celda como se ven impresos.
 *
 * La memoria de 2012 escribe «PUESTO» como «PU», «es», «TO»: trozos pegados
 * que hay que unir sin espacio. Dos trozos con aire entre medio son dos palabras.
 */
export function joinGlyphs(glyphs: readonly Glyph[]): string {
  const ordered = [...glyphs].sort((left, right) => left.x - right.x);
  let text = '';
  let last: Glyph | undefined;
  for (const glyph of ordered) {
    const glued = last !== undefined && glyph.x - last.right < 0.8;
    text += (text && !glued ? ' ' : '') + glyph.text;
    last = glyph;
  }
  return text.replace(/\s+/gu, ' ').trim();
}

/**
 * Una cifra tal como la imprime la celda, limpia de lo que no es cifra.
 *
 * La memoria de 2014 dibuja el punto de los miles con un glifo que la fuente no
 * sabe nombrar (U+FFFD) y lo parte en tres trozos: «4 � 086» es 4.086. Se
 * devuelve con su punto para que el extracto cite lo que se ve en la página.
 */
export function printedFigure(cell: string): string {
  return mendSeparators(cell).replace(/\*/gu, '').replace(/\s+/gu, '').trim();
}

/**
 * El separador que la fuente no supo nombrar, repuesto por su lugar.
 *
 * El mismo glifo U+FFFD hace de punto de miles en «4 � 086» y de coma decimal
 * en «71 � 1%» (2014). Lo decide lo que sigue, con la regla de la cifra: tres
 * dígitos son miles, uno o dos son decimales.
 */
export const mendSeparators = (text: string): string =>
  text.replace(
    /(\d)\s*\uFFFD\s*(\d+)/gu,
    (_, before: string, after: string) => `${before}${after.length === 3 ? '.' : ','}${after}`,
  );

/**
 * El número de una cifra impresa, con la misma regla que usa el sembrador.
 *
 * Las memorias mezclan ortografías: 2019 y 2022 escriben «24,712.6» y «60.0%»,
 * el resto «24.712,6» y «60,0%», y la cuenta de contribuyentes de 2019 sale
 * como «449.996» en una tabla de decimales con punto. La regla que no depende
 * de la edición es la de `quantitative-grounding`: el último separador es
 * decimal si le siguen uno o dos dígitos (o si lo precede un cero), y de miles
 * si le siguen tres. Usar la misma regla garantiza que el valor guardado sea el
 * que el sembrador encuentra en el extracto.
 */
export function plainNumber(printed: string): string {
  const clean = printedFigure(printed).replace(/%$/u, '');
  if (!/^-?\d+(?:[.,]\d+)*$/u.test(clean)) throw new Error(`«${printed}» no es una cifra`);
  const negative = clean.startsWith('-');
  const parts = clean.replace(/^-/u, '').split(/[.,]/u);
  const integer = parts[0] ?? '';
  const fraction = parts.at(-1) ?? '';
  const decimal = parts.length > 1 && (fraction.length < 3 || integer === '0');
  const whole = (decimal ? parts.slice(0, -1) : parts).join('').replace(/^0+(?=\d)/u, '');
  const text = decimal ? `${whole}.${fraction}` : whole;
  return negative ? `-${text}` : text;
}

/**
 * Los cortes entre `count` columnas de cifras, leídos de las cifras mismas.
 *
 * Las cifras de una columna se alinean a la derecha y sus centros caen cerca;
 * entre dos columnas hay un hueco mucho mayor que dentro de una. Los `count - 1`
 * huecos más anchos entre centros ordenados son las fronteras. Si el hueco más
 * angosto de esos es menor que el más ancho de dentro de una columna, la
 * página no tiene la forma declarada y se dice.
 */
export function columnCuts(glyphs: readonly Glyph[], count: number, where: string): number[] {
  const centres = glyphs.map((glyph) => (glyph.x + glyph.right) / 2).sort((a, b) => a - b);
  const gaps = centres
    .slice(1)
    .map((centre, index) => ({ at: index, width: centre - (centres[index] ?? 0) }));
  const widest = [...gaps].sort((left, right) => right.width - left.width).slice(0, count - 1);
  if (widest.length < count - 1 || widest.some((gap) => gap.width < 12)) {
    throw new Error(`${where}: no se distinguen ${count} columnas de cifras`);
  }
  return widest
    .map((gap) => ((centres[gap.at] ?? 0) + (centres[gap.at + 1] ?? 0)) / 2)
    .sort((left, right) => left - right);
}

/** En qué columna cae un trozo, según los cortes de su página. */
export const columnOf = (glyph: Glyph, cuts: readonly number[]): number => {
  const centre = (glyph.x + glyph.right) / 2;
  return cuts.filter((cut) => centre > cut).length;
};

/** La distancia típica entre dos filas con número, para saber qué está «cerca». */
export function rowPitch(anchors: readonly PdfRow[]): number {
  const steps = anchors
    .slice(1)
    .map((row, index) => Math.abs((anchors[index]?.y ?? row.y) - row.y))
    .filter((step) => step > 1)
    .sort((a, b) => a - b);
  return steps[Math.floor(steps.length / 2)] ?? 12;
}

/**
 * La fila con número de la que cuelga una línea suelta, si hay una cerca.
 *
 * Un nombre que no cabe en su celda sigue en la línea de abajo (o empieza en la
 * de arriba, cuando la celda centra el texto en vertical) y una cifra a veces
 * se imprime medio renglón más abajo que su fila. Las dos cosas son la misma
 * fila de la fuente; lo que las une es la altura, no el orden del texto.
 */
export function nearestAnchor<T extends { row: PdfRow }>(
  line: PdfRow,
  anchors: readonly T[],
  pitch: number,
  reach = 0.75,
): T | undefined {
  let best: T | undefined;
  let distance = Number.POSITIVE_INFINITY;
  for (const anchor of anchors) {
    if (anchor.row.page !== line.page) continue;
    const gap = Math.abs(anchor.row.y - line.y);
    if (gap < distance) {
      best = anchor;
      distance = gap;
    }
  }
  return distance <= pitch * reach ? best : undefined;
}

/** El texto sin tildes y en mayúsculas, para comparar rótulos. */
export const folded = (text: string): string =>
  text
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/gu, '')
    .toUpperCase()
    .replace(/\s+/gu, ' ')
    .trim();

/**
 * Las filas recortadas a una franja horizontal de cada página.
 *
 * Varias memorias ponen el cuadro en una columna y el texto corrido en la otra
 * (2014, 2019): sin recortar, el párrafo de al lado se pega a las filas del
 * cuadro porque comparte la altura. La franja la declara la edición.
 */
export function withinBand(
  rows: readonly PdfRow[],
  bands: Readonly<Record<number, readonly [number, number]>> | undefined,
): PdfRow[] {
  if (!bands) return [...rows];
  return rows.flatMap((row) => {
    const band = bands[row.page];
    if (!band) return [row];
    const glyphs = row.glyphs.filter((glyph) => glyph.x >= band[0] && glyph.x < band[1]);
    return glyphs.length === 0 ? [] : [{ ...row, glyphs, text: joinGlyphs(glyphs) }];
  });
}
