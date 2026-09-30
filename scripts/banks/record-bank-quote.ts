import { existsSync, readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { bankVirtualAssetsSchema } from '../../src/database/seeds/schemas/bank-virtual-assets.schema';
import { laPazDate, mergeSeed } from './bank-readings';
import { quoteReadings } from './bank-quote-capture';

/**
 * Registra a mano lo que un banco cobra y paga por cada USDT o USDC.
 *
 *   yarn banks:quote BNB --compra 9.30 --venta 9.35 --fuente "captura de BNB Móvil, 15:20"
 *
 * `--compra` es lo que el cliente paga por cada ficha y `--venta` lo que
 * recibe al vender; `--fecha AAAA-MM-DD` es opcional y por defecto es hoy en
 * La Paz. Ningún banco publica esa cifra fuera de su aplicación, así que no
 * hay recolector que la lea: alguien la mira en la app y la anota aquí.
 */

const SEED = join('src', 'database', 'seeds', 'boot', 'bank-virtual-assets.json');

function option(args: readonly string[], name: string): string | undefined {
  const at = args.indexOf(`--${name}`);
  return at >= 0 ? args[at + 1] : undefined;
}

function main(): void {
  const args = process.argv.slice(2);
  const bank = args[0]?.toUpperCase();
  const clientBuys = option(args, 'compra');
  const clientSells = option(args, 'venta');
  const source = option(args, 'fuente');
  if (!bank || !clientBuys || !clientSells || !source) {
    throw new Error('uso: banks:quote <BANCO> --compra <Bs> --venta <Bs> --fuente "<de dónde>"');
  }
  const now = new Date();
  const readings = quoteReadings({
    bank,
    clientBuys,
    clientSells,
    source,
    date: option(args, 'fecha') ?? laPazDate(now),
    now,
  });
  const previous = existsSync(SEED)
    ? bankVirtualAssetsSchema.parse(JSON.parse(readFileSync(SEED, 'utf8'))).series
    : [];
  const { series } = bankVirtualAssetsSchema.parse({ series: mergeSeed(previous, readings) });
  writeFileSync(SEED, `${JSON.stringify({ series }, null, 2)}\n`);
  const noted = readings.map((one) => one.point.value).join(' / ');
  process.stdout.write(`${bank}: ${noted} Bs anotados\n`);
}

try {
  main();
} catch (error) {
  process.stderr.write(`${error instanceof Error ? error.message : 'no se pudo anotar'}\n`);
  process.exitCode = 1;
}
