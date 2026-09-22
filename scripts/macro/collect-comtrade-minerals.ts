import { createHash } from 'node:crypto';
import { writeFileSync } from 'node:fs';
import { join } from 'node:path';
import {
  COMMODITIES,
  COMTRADE_PREVIEW,
  FIRST_YEAR,
  PUBLISHER,
  REPORTER,
  USER_AGENT,
  indicatorCode,
} from './mineral-trade-sources';

/**
 * Recoge lo que Bolivia declaró exportar de cada mineral, año por año.
 *
 * El observatorio no tenía una sola cifra de minerales por producto ni de
 * litio. Tenía las rentas del Banco Mundial —un porcentaje del PIB que no
 * distingue un mineral de otro y cierra en 2021— y el total de mercancías del
 * mismo registro que este lee, que no distingue productos en absoluto.
 *
 * Una petición por año y no una por producto. El registro acepta varias
 * partidas en el mismo `cmdCode` y responde con una fila por cada una, así que
 * treinta y cuatro peticiones cubren quince productos en las dos medidas: el
 * colector hermano de comercio total hace una petición por año **y por flujo**
 * porque pide un único código. Menos peticiones sobre un servicio con cuota no
 * es una optimización, es lo que permite que la corrida termine.
 *
 * De eso se sigue la forma del archivo: la respuesta de un año es **una** sola
 * descarga que contiene todas las partidas de ese año, así que su dirección y
 * su huella son las mismas para todas ellas. Cada punto las lleva igual —una
 * huella repetida en treinta series es la verdad sobre cómo se obtuvo el dato—
 * y el sembrador concilia el artefacto por esa huella, de modo que la descarga
 * de un año entra una vez y no treinta.
 *
 * El extracto de cada punto es la fila de su propia partida y no la respuesta
 * entera: la comprobación de anclaje del sembrador exige que la cifra aparezca
 * literal en el registro citado, y una respuesta con quince filas anclaría
 * cualquier cifra de cualquier producto contra cualquier otro.
 *
 * Se corre con `yarn minerals:collect`.
 */

const SEED = join('src', 'database', 'seeds', 'boot', 'mineral-trade.json');
/** El servicio de vista previa tiene cuota; esto mantiene la corrida dentro. */
const PAUSE_MS = 1_800;
const ATTEMPTS = 4;

interface Row {
  readonly cmdCode: string;
  readonly motCode: number;
  readonly customsCode: string;
  readonly partner2Code: number;
  readonly primaryValue: number | null;
  readonly netWgt: number | null;
}

interface Point {
  period: string;
  value: string;
  excerpt: string;
  sourceUrl: string;
  upstreamSha256: string;
  retrievedAt: string;
}

function sleep(milliseconds: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, milliseconds));
}

/**
 * El total del año de una partida, no una de sus formas de cruzar la frontera.
 *
 * El registro desglosa cada partida por modo de transporte, régimen aduanero y
 * segundo socio, y cada desglose es un número real. Sumarlos o tomar el primero
 * serían los dos incorrectos: el propio registro declara el total como la fila
 * donde los tres desgloses se anulan, y esa es la única que se lee. Es la misma
 * regla que sigue el colector del comercio total, escrita aquí otra vez porque
 * aquí hay que aplicarla una vez por partida.
 */
function totalRow(rows: readonly Row[], hs: string): Row | undefined {
  return rows.find(
    (row) =>
      row.cmdCode === hs &&
      row.motCode === 0 &&
      row.customsCode === 'C00' &&
      row.partner2Code === 0,
  );
}

async function fetchYear(year: number): Promise<{ bytes: Buffer; url: string }> {
  const url =
    `${COMTRADE_PREVIEW}?reporterCode=${REPORTER}&period=${year}&partnerCode=0` +
    `&cmdCode=${COMMODITIES.map((commodity) => commodity.hs).join(',')}&flowCode=X`;
  let failure = 'sin intentos';
  for (let attempt = 1; attempt <= ATTEMPTS; attempt += 1) {
    try {
      const response = await fetch(url, {
        headers: { 'User-Agent': USER_AGENT },
        signal: AbortSignal.timeout(45_000),
      });
      if (response.ok) return { bytes: Buffer.from(await response.arrayBuffer()), url };
      failure = `respondio ${response.status}`;
    } catch (error: unknown) {
      failure = error instanceof Error ? error.message : 'fallo de red';
    }
    await sleep(PAUSE_MS * attempt * 2);
  }
  throw new Error(`${year}: el registro ${failure} tras ${ATTEMPTS} intentos`);
}

/**
 * El peso neto no siempre viene, y cuando no viene no se inventa.
 *
 * Las declaraciones más viejas traen el valor y dejan el peso en nulo. Una
 * serie física con huecos es correcta; una con ceros donde el registro calló
 * diría que ese año no salió nada, que es una afirmación que nadie hizo.
 */
function measureOf(row: Row, measure: 'USD' | 'KG'): number | null {
  const raw = measure === 'USD' ? row.primaryValue : row.netWgt;
  return typeof raw === 'number' && Number.isFinite(raw) && raw > 0 ? raw : null;
}

async function collect(): Promise<unknown[]> {
  const retrievedAt = `${new Date().toISOString().slice(0, 19)}Z`;
  /*
   * Hasta el año pasado, no hasta este.
   *
   * Una declaración aduanera anual se cierra cuando el año termina, y el
   * registro sirve el año en curso como un acumulado parcial que baja cada vez
   * que alguien lo consulta a mitad de camino. Pedirlo metería en la serie un
   * punto que no es comparable con los de arriba.
   */
  const closed = new Date().getUTCFullYear() - 1;
  const points = new Map<string, Point[]>();

  for (let year = FIRST_YEAR; year <= closed; year += 1) {
    const { bytes, url } = await fetchYear(year);
    const sha256 = createHash('sha256').update(bytes).digest('hex');
    const parsed = JSON.parse(bytes.toString('utf-8')) as { data?: readonly Row[] };
    const rows = parsed.data ?? [];
    const found: string[] = [];

    for (const commodity of COMMODITIES) {
      const row = totalRow(rows, commodity.hs);
      if (row === undefined) continue;
      const excerpt = JSON.stringify(row);
      for (const measure of ['USD', 'KG'] as const) {
        const value = measureOf(row, measure);
        if (value === null) continue;
        const code = indicatorCode(commodity, measure);
        const own = points.get(code) ?? [];
        own.push({
          period: String(year),
          value: String(value),
          excerpt,
          sourceUrl: url,
          upstreamSha256: sha256,
          retrievedAt,
        });
        points.set(code, own);
      }
      found.push(commodity.hs);
    }

    // Una línea por año: la corrida es larga y casi toda espera, y quien la
    // mira necesita ver qué año va lento en vez de una hora en silencio.
    console.log(`  ${year}  ${String(found.length).padStart(2)} partidas declaradas`);
    await sleep(PAUSE_MS);
  }

  const series: unknown[] = [];
  for (const commodity of COMMODITIES) {
    for (const measure of ['USD', 'KG'] as const) {
      const code = indicatorCode(commodity, measure);
      const own = points.get(code);
      if (!own?.length) {
        /*
         * Una partida sin una sola declaración es un hallazgo, no un fallo.
         *
         * El cinc en bruto está en la lista porque Bolivia podría refinarlo y
         * no lo hace. Se dice en la salida de la corrida y la serie no se
         * escribe: una serie vacía en el archivo cargaría un indicador sin
         * puntos y dibujaría una leyenda sin línea.
         */
        console.log(`  ${code.padEnd(42)} sin declaraciones en todo el periodo`);
        continue;
      }
      series.push({
        indicatorCode: code,
        hsCode: commodity.hs,
        level: commodity.level,
        family: commodity.family,
        name: `${commodity.name} exportados${measure === 'KG' ? ' (peso neto)' : ''}`,
        unit: measure,
        publisher: PUBLISHER,
        frequency: 'ANNUAL',
        points: own,
      });
    }
  }
  return series;
}

async function main(): Promise<void> {
  const closed = new Date().getUTCFullYear() - 1;
  console.log(`\nmineral-trade.json  (${FIRST_YEAR}-${closed})`);
  const series = await collect();
  writeFileSync(SEED, `${JSON.stringify({ series }, null, 2)}\n`, 'utf-8');
  const total = series.reduce<number>(
    (count, one) => count + (one as { points: unknown[] }).points.length,
    0,
  );
  console.log(`  -> ${series.length} series, ${total} observaciones`);
}

main().catch((error: unknown) => {
  process.stderr.write(
    `${error instanceof Error ? error.message : 'Comtrade minerals collection failed'}\n`,
  );
  process.exitCode = 1;
});
