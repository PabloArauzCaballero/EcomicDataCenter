import { LARGEST_EDITIONS, type LargestEdition } from './largest-sources';
import { download } from './business-common';
import { pdfRows } from './pdf-rows';

/**
 * Comprueba si alguna edición gratuita de «Las 500» trae sus cuadros como texto.
 *
 * `largest-sources` cuenta por qué hoy ninguna lo hace. Este colector no
 * siembra nada mientras sea así: baja cada edición declarada, confirma que la
 * copia espejo sea el mismo archivo y cuenta las cifras que la capa de texto
 * tiene en las páginas de los cuadros. Si encuentra cifras, se detiene y lo
 * dice, porque entonces hay un cuadro que leer por coordenadas y el lector de
 * columnas todavía no existe; si no, informa el hueco con su motivo. Lo que no
 * hace es leer las imágenes: una cifra adivinada por reconocimiento de
 * caracteres, sin texto contra el cual cotejarla, no entra al corpus.
 *
 * Se corre con
 * `node --max-old-space-size=700 node_modules/tsx/dist/cli.mjs scripts/business/collect-largest-companies.ts`.
 */

/** Una cifra de cuadro: al menos cuatro dígitos con separador, como «34.623». */
const TABLE_FIGURE = /^-?\d{1,3}(?:[.,]\d{3})+(?:,\d+)?$/u;

async function probe(edition: LargestEdition): Promise<string> {
  const file = await download(edition.url);
  const mirror = await download(edition.mirror);
  if (mirror.sha256 !== file.sha256) {
    throw new Error(`Ranking ${edition.edition}: la copia espejo no es el mismo archivo`);
  }
  const rows = await pdfRows(file.bytes, edition.tablePages);
  const figures = rows
    .flatMap((row) => row.glyphs)
    .filter((glyph) => TABLE_FIGURE.test(glyph.text));
  if (figures.length > 0) {
    throw new Error(
      `Ranking ${edition.edition}: ${figures.length} cifras con capa de texto en las páginas de cuadros; falta escribir el lector por coordenadas (se esperan ${edition.companies} empresas)`,
    );
  }
  return `Ranking ${edition.edition} (gestión ${edition.fiscalYear}): ${edition.tablePages.length} páginas de cuadros sin una sola cifra en la capa de texto (son imágenes); 0 de ${edition.companies} empresas legibles`;
}

async function main(): Promise<void> {
  const gaps: string[] = [];
  for (const edition of LARGEST_EDITIONS) gaps.push(await probe(edition));
  for (const gap of gaps) console.log(`  hueco: ${gap}`);
  console.log('  sin semilla: ninguna edición gratuita trae su cuadro como texto');
}

main().catch((error: unknown) => {
  process.stderr.write(
    `${error instanceof Error ? (error.stack ?? error.message) : 'las 500 fallaron'}\n`,
  );
  process.exitCode = 1;
});
