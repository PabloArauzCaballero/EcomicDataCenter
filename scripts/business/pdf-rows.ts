/**
 * Las filas de un PDF, leídas por su posición en la página.
 *
 * Los cuadros de las memorias de Impuestos y de los reportes del registro de
 * comercio no se pueden leer como texto corrido: pasados a texto, la columna
 * del departamento se corre una fila en la mitad de la tabla y una celda vacía
 * desplaza todas las cifras de su renglón. Leídos por coordenadas no: cada
 * trozo de texto trae su `x` y su `y`, una fila es lo que comparte la `y` y una
 * columna es un tramo de `x` que el colector declara a partir del encabezado.
 */

/** Un trozo de texto con su posición, en puntos desde la esquina inferior izquierda. */
export interface Glyph {
  readonly text: string;
  readonly x: number;
  readonly right: number;
  readonly y: number;
}

/** Una línea de la página: los trozos que comparten altura, de izquierda a derecha. */
export interface PdfRow {
  readonly page: number;
  readonly y: number;
  readonly glyphs: readonly Glyph[];
  /** La línea entera, con un espacio entre trozos: sirve de extracto. */
  readonly text: string;
}

interface TextItemLike {
  readonly str?: string;
  readonly transform?: readonly number[];
  readonly width?: number;
}

interface PdfModule {
  getDocument(options: Record<string, unknown>): {
    promise: Promise<{
      numPages: number;
      getPage(page: number): Promise<{
        getTextContent(): Promise<{ items: readonly TextItemLike[] }>;
        cleanup(): void;
      }>;
    }>;
    destroy(): Promise<void>;
  };
}

/**
 * Agrupa los trozos por altura con una tolerancia, no por igualdad.
 *
 * Una misma fila impresa trae trozos con `y` que difieren en décimas —una
 * cifra en negrita, un superíndice— y exigir igualdad parte el renglón en dos.
 */
function linesOf(page: number, glyphs: Glyph[], tolerance: number): PdfRow[] {
  const sorted = [...glyphs].sort((left, right) => right.y - left.y || left.x - right.x);
  const rows: { y: number; glyphs: Glyph[] }[] = [];
  for (const glyph of sorted) {
    const row = rows.find((candidate) => Math.abs(candidate.y - glyph.y) <= tolerance);
    if (row) row.glyphs.push(glyph);
    else rows.push({ y: glyph.y, glyphs: [glyph] });
  }
  return rows
    .sort((left, right) => right.y - left.y)
    .map((row) => {
      const ordered = row.glyphs.sort((left, right) => left.x - right.x);
      return {
        page,
        y: row.y,
        glyphs: ordered,
        text: ordered.map((glyph) => glyph.text).join(' ').replace(/\s+/gu, ' ').trim(),
      };
    });
}

/**
 * Todas las líneas de las páginas pedidas (1-based), o de todo el documento.
 */
export async function pdfRows(
  bytes: Buffer,
  pages?: readonly number[],
  tolerance = 2.5,
): Promise<PdfRow[]> {
  const pdfjs = (await import('pdfjs-dist/legacy/build/pdf.mjs')) as unknown as PdfModule;
  const task = pdfjs.getDocument({
    data: new Uint8Array(bytes),
    isEvalSupported: false,
    useWorkerFetch: false,
    disableFontFace: true,
    verbosity: 0,
  });
  const document = await task.promise;
  try {
    const wanted = pages ?? Array.from({ length: document.numPages }, (_, index) => index + 1);
    const rows: PdfRow[] = [];
    for (const number of wanted) {
      if (number < 1 || number > document.numPages) continue;
      const page = await document.getPage(number);
      const content = await page.getTextContent();
      const glyphs: Glyph[] = [];
      for (const item of content.items) {
        const text = (item.str ?? '').trim();
        const transform = item.transform;
        if (!text || !transform) continue;
        const x = transform[4] ?? 0;
        glyphs.push({ text, x, right: x + (item.width ?? 0), y: transform[5] ?? 0 });
      }
      rows.push(...linesOf(number, glyphs, tolerance));
      page.cleanup();
    }
    return rows;
  } finally {
    await task.destroy();
  }
}

/** Cuántas páginas tiene un documento. */
export async function pageCount(bytes: Buffer): Promise<number> {
  const pdfjs = (await import('pdfjs-dist/legacy/build/pdf.mjs')) as unknown as PdfModule;
  const task = pdfjs.getDocument({
    data: new Uint8Array(bytes),
    isEvalSupported: false,
    disableFontFace: true,
    verbosity: 0,
  });
  const count = (await task.promise).numPages;
  await task.destroy();
  return count;
}

/**
 * Las celdas de una fila según tramos de `x` declarados.
 *
 * Cada tramo es `[desde, hasta)`. Un trozo cae en el tramo que contiene su
 * centro; los que no caen en ninguno se descartan, porque en estos cuadros son
 * números de página o notas al margen.
 */
export function cells(row: PdfRow, bounds: readonly (readonly [number, number])[]): string[] {
  return bounds.map(([from, to]) =>
    row.glyphs
      .filter((glyph) => {
        const centre = (glyph.x + glyph.right) / 2;
        return centre >= from && centre < to;
      })
      .map((glyph) => glyph.text)
      .join(' ')
      .replace(/\s+/gu, ' ')
      .trim(),
  );
}
