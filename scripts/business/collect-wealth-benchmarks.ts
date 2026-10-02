import { SeriesBook, writeSeed } from './business-common';
import { collectDamodaran } from './wealth-damodaran';
import { collectForbes } from './wealth-forbes';
import { collectUbs } from './wealth-ubs';

/**
 * Las referencias de riqueza: fortunas de Forbes, riqueza de los hogares de
 * UBS y múltiplos de mercado de Damodaran, en una sola semilla.
 *
 * `wealth-sources` explica qué es cada una y por qué está; aquí sólo se corren
 * en orden y se escribe lo que dieron. Las tres se descargan en cada corrida y
 * se leen sin transcribir: la lista de Forbes por su API, el Databook por las
 * coordenadas de sus cuadros y los múltiplos desde el binario del `.xls`.
 * Lo que una fuente no trae se cuenta al final, en vez de callarse.
 *
 * Se corre con
 * `node --max-old-space-size=700 node_modules/tsx/dist/cli.mjs scripts/business/collect-wealth-benchmarks.ts`
 * y `--fresh` para ignorar la copia local de las descargas.
 */

async function main(): Promise<void> {
  const book = new SeriesBook();
  console.log('Forbes');
  const forbesNotes = await collectForbes(book);
  console.log('UBS');
  const ubsNotes = await collectUbs(book);
  console.log('Damodaran');
  await collectDamodaran(book);
  writeSeed('wealth-benchmarks.json', book.all());
  for (const note of [...forbesNotes, ...ubsNotes]) console.log(`  hueco: ${note}`);
}

main().catch((error: unknown) => {
  process.stderr.write(
    `${error instanceof Error ? (error.stack ?? error.message) : 'la riqueza falló'}\n`,
  );
  process.exitCode = 1;
});
