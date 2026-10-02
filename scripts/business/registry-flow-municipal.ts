import type { PdfRow } from './pdf-rows';
import { codeOf, spanishNumber } from './business-common';
import type { Measure } from './registry-flow-sources';

/**
 * Los municipios con más movimiento, tal como el reporte los nombra.
 *
 * Los reportes de FUNDEMPRESA dibujan el cuadro por municipio como gráfico sin
 * rótulos legibles, pero el párrafo que lo presenta nombra los tres o cuatro
 * primeros con su cifra: «los municipios con mayor cantidad de empresas
 * inscritas fueron Santa Cruz de la Sierra con 5.101 empresas; La Paz con
 * 3.522, El Alto con 2.260 y Cochabamba con 2.143». Es poco, pero son las
 * capitales y El Alto, que es lo que se pidió conservar, y es texto: no hay
 * nada que atar por posición.
 */

export interface MunicipalFigure {
  readonly measure: Measure;
  readonly key: string;
  readonly name: string;
  readonly value: string;
  readonly excerpt: string;
}

/** Qué flujo describe el párrafo, por las palabras con que lo dice. */
function measureOf(paragraph: string): Measure | undefined {
  if (/inscrit/u.test(paragraph)) return 'NEW';
  if (/actualizad/u.test(paragraph)) return 'RENEWED';
  if (/cancelad/u.test(paragraph)) return 'CANCELLED';
  return undefined;
}

/** El párrafo que empieza en una fila: las filas siguientes de la misma página y el mismo margen. */
function paragraphFrom(rows: readonly PdfRow[], start: number): string {
  const first = rows[start];
  if (!first) return '';
  const parts = [first.text];
  for (let index = start + 1; index < Math.min(rows.length, start + 5); index += 1) {
    const row = rows[index];
    if (!row || row.page !== first.page || Math.abs((row.glyphs[0]?.x ?? 0) - (first.glyphs[0]?.x ?? 0)) > 3) break;
    parts.push(row.text);
    if (/Ver gr\S+fico/u.test(row.text)) break;
  }
  return parts.join(' ');
}

export function municipalFigures(rows: readonly PdfRow[], where: string): MunicipalFigure[] {
  const figures: MunicipalFigure[] = [];
  rows.forEach((row, index) => {
    if (!/municipios con mayor/u.test(row.text)) return;
    const paragraph = paragraphFrom(rows, index);
    const measure = measureOf(paragraph);
    // El párrafo de la base vigente es stock, no flujo: lo lleva otro colector.
    if (!measure) return;
    const list = /fueron (.+?)\.\s*Ver/u.exec(paragraph)?.[1];
    if (!list) throw new Error(`${where}: párrafo de municipios ilegible «${paragraph}»`);
    const named = [...list.matchAll(/(?:^|[;,]\s*|\sy\s)([A-ZÁÉÍÓÚ][\p{L} ]+?)(?:\s+con)?\s+(\d{1,3}(?:\.\d{3})*)/gu)];
    if (named.length < 3) throw new Error(`${where}: sólo ${named.length} municipios en «${paragraph}»`);
    for (const hit of named) {
      const name = (hit[1] ?? '').trim();
      figures.push({ measure, key: codeOf(name), name, value: spanishNumber(hit[2] ?? ''), excerpt: paragraph });
    }
  });
  return figures;
}
