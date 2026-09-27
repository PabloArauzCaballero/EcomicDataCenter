import { createHash } from 'node:crypto';
import { writeFileSync } from 'node:fs';
import { join } from 'node:path';

/**
 * Amplía el comercio exterior declarado: por país socio y por producto.
 *
 * `collect-comtrade-trade.ts` ya trae el total nacional de exportaciones e
 * importaciones, pero un solo número por año y por flujo no contesta «qué
 * exporta Bolivia» ni «a quién». El registro de Naciones Unidas sí lo sabe: la
 * misma declaración aduanera que produce el total viene, en el propio
 * registro, desglosada por socio comercial y por capítulo del Sistema
 * Armonizado. Este colector pide esos dos desgloses, no el cruce de ambos.
 *
 * **Por qué no el cruce producto × país.** El nivel gratuito («preview», sin
 * clave) del registro no distingue: acepta la misma combinación de parámetros
 * que el nivel pagado, sin una cuota documentada distinta a un límite de
 * frecuencia. Pedir el cruce completo —cada capítulo contra cada socio, cada
 * año— multiplicaría las peticiones por el número de socios (cientos) y haría
 * una corrida de horas para una tabla que nadie va a leer entera. El total por
 * socio y el total por producto, cada uno agregando sobre la otra dimensión,
 * contestan lo que pidió el usuario: qué se exporta, y a quién.
 *
 * **Un ahorro que no estaba en el guion.** El colector original pide
 * `partnerCode=0` para fijar el mundo como socio único; omitir ese parámetro
 * no cambia el nivel de acceso, cambia la respuesta — el registro devuelve
 * TODOS los socios del año en una sola petición, no uno por socio. Lo mismo
 * con el producto: `cmdCode=AG2` trae los noventa y siete capítulos de dos
 * dígitos en una petición, en vez de noventa y siete peticiones por capítulo
 * pedido a mano. Verificado contra el registro antes de escribir este archivo:
 * una petición por año y por flujo basta para cada desglose, así que la
 * corrida completa (2020 al último año cerrado, dos flujos, dos desgloses, más
 * dos peticiones de referencia para los nombres) es del orden de treinta
 * peticiones, no de varios cientos.
 *
 * **El tope de 500 filas, y por qué las peticiones fijan `motCode=0` y
 * `customsCode=C00`.** El nivel «preview» corta cada respuesta en 500 filas y
 * lo declara en `count`, sin avisar de otro modo que faltan filas. Sin fijar
 * esos dos parámetros, la respuesta trae una fila por cada combinación de
 * socio (o capítulo) con modo de transporte y procedimiento aduanero — cientos
 * de filas de las que sólo interesa una por socio, la agregada. 2024 y 2025 ya
 * superan las 500 filas sin el filtro (probado contra el registro el
 * 2026-09-23: importaciones por socio de 2025 truncaba en 500 filas y
 * publicaba sólo 3 de los 20 socios que debía, con los grandes ausentes y sin
 * ningún error). Pedir directamente la fila que se iba a quedar
 * (`motCode=0&customsCode=C00`, el mismo filtro de `isAggregateRow`) evita el
 * tope en vez de toparse con él: 2025 queda en 178-226 filas según el
 * desglose, muy por debajo de 500. El colector además revienta si `count`
 * llega a 500 de todos modos, para no volver a publicar una siembra truncada
 * en silencio si el número de combinaciones sigue creciendo.
 *
 * **Por qué sólo un puñado de socios y de productos por flujo, no todos los
 * que trae la respuesta.** El registro devuelve entre cien y ciento veinte
 * socios y cerca de noventa capítulos por año; la mayoría son declaraciones de
 * unos pocos dólares. Publicar los top 20 por valor acumulado 2020-último año
 * cumple de sobra el piso de 10-15 socios que pidió el encargo y evita un
 * catálogo de cientos de series casi vacías que ningún tablero puede mostrar
 * con sentido. El resto de la respuesta no se descarta por falta de acceso —
 * se descarta por relevancia, y queda dicho aquí en vez de disimulado.
 *
 * **Sin mensual.** El nivel «preview» no ofrece frecuencia mensual para
 * Bolivia; sólo `A` (anual). Pedirla habría significado usar `M` en la ruta y
 * el registro la rechaza para este reportero en este nivel. No es una
 * limitación de este colector, es del nivel de acceso gratuito.
 *
 * Run con `yarn trade-detail:collect`.
 */

const BASE = 'https://comtradeapi.un.org/public/v1/preview/C/A/HS';
const REFERENCE_BASE = 'https://comtradeapi.un.org/files/v1/app/reference';
/** Código de Bolivia como reportero en el registro. */
const REPORTER = 68;
const PUBLISHER = 'NACIONES UNIDAS';
const UA = 'Mozilla/5.0 (compatible; ObservatorioEconomicoBO/1.0)';
const PARTNERS_SEED = join('src', 'database', 'seeds', 'boot', 'foreign-trade-partners.json');
const PRODUCTS_SEED = join('src', 'database', 'seeds', 'boot', 'foreign-trade-products.json');
/** Primer año pedido por el encargo; el registro tiene datos desde mucho antes. */
const FIRST_YEAR = 2020;
/** El endpoint «preview» tiene límite de frecuencia; mismo margen que el colector hermano. */
const PAUSE_MS = 1_500;
const ATTEMPTS = 4;
/** Cuántos socios o productos publicar por flujo, ordenados por valor acumulado. */
const TOP_N = 20;

interface Row {
  readonly motCode: number;
  readonly customsCode: string;
  readonly partner2Code: number;
  readonly partnerCode: number;
  readonly cmdCode: string;
  readonly primaryValue: number | null;
}

type FlowCode = 'X' | 'M';

interface Flow {
  readonly code: FlowCode;
  readonly verb: string;
}

const FLOWS: readonly Flow[] = [
  { code: 'X', verb: 'Exportaciones' },
  { code: 'M', verb: 'Importaciones' },
];

function sleep(milliseconds: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, milliseconds));
}

async function fetchWithRetry(url: string, label: string): Promise<{ bytes: Buffer; url: string }> {
  let failure = 'sin intentos';
  for (let attempt = 1; attempt <= ATTEMPTS; attempt += 1) {
    try {
      const response = await fetch(url, {
        headers: { 'User-Agent': UA },
        signal: AbortSignal.timeout(45_000),
      });
      if (response.ok) return { bytes: Buffer.from(await response.arrayBuffer()), url };
      failure = `respondio ${response.status}`;
    } catch (error: unknown) {
      failure = error instanceof Error ? error.message : 'fallo de red';
    }
    await sleep(PAUSE_MS * attempt * 2);
  }
  throw new Error(`${label}: el registro ${failure} tras ${ATTEMPTS} intentos`);
}

/**
 * Las filas que valen el total: sin desglose por modo de transporte, por
 * procedimiento aduanero ni por segundo socio. Mismo filtro que el colector
 * del total nacional, aplicado ahora a cada socio o a cada capítulo por
 * separado en vez de al mundo entero.
 */
function isAggregateRow(row: Row): boolean {
  return row.motCode === 0 && row.customsCode === 'C00' && row.partner2Code === 0;
}

/** Nombres de los 310 socios del registro, en inglés, tal como el registro los declara. */
async function fetchPartnerNames(): Promise<ReadonlyMap<number, string>> {
  const { bytes } = await fetchWithRetry(`${REFERENCE_BASE}/partnerAreas.json`, 'lista de socios');
  const parsed = JSON.parse(bytes.toString('utf-8')) as {
    results: ReadonlyArray<{ PartnerCode: string; PartnerDesc: string }>;
  };
  const names = new Map<number, string>();
  for (const entry of parsed.results) {
    const code = Number(entry.PartnerCode);
    if (Number.isFinite(code)) names.set(code, entry.PartnerDesc);
  }
  return names;
}

/** Nombres de los 97 capítulos de dos dígitos del Sistema Armonizado (edición HS6/2022). */
async function fetchChapterNames(): Promise<ReadonlyMap<string, string>> {
  const { bytes } = await fetchWithRetry(`${REFERENCE_BASE}/H6.json`, 'lista de capitulos');
  const parsed = JSON.parse(bytes.toString('utf-8')) as {
    results: ReadonlyArray<{ id: string; text: string }>;
  };
  const names = new Map<string, string>();
  for (const entry of parsed.results) {
    if (/^\d{2}$/u.test(entry.id)) names.set(entry.id, entry.text);
  }
  return names;
}

interface YearFetch {
  readonly year: number;
  readonly rows: readonly Row[];
  readonly bytes: Buffer;
  readonly url: string;
  readonly sha256: string;
  readonly retrievedAt: string;
}

async function fetchYear(flow: Flow, year: number, query: string, label: string): Promise<YearFetch> {
  const url = `${BASE}?reporterCode=${REPORTER}&period=${year}&flowCode=${flow.code}${query}`;
  const { bytes } = await fetchWithRetry(url, `${label} ${flow.code} ${year}`);
  const parsed = JSON.parse(bytes.toString('utf-8')) as { data?: readonly Row[]; count?: number };
  const rows = parsed.data ?? [];
  // El nivel «preview» corta la respuesta en 500 filas y lo dice en `count`
  // sin devolver el resto: 2024 y 2025 ya rozan ese techo con el filtro de
  // abajo puesto, y sin él lo superan y faltan socios grandes sin que la
  // respuesta lo señale de otro modo. Cortar la corrida es preferible a
  // escribir una siembra que calla un socio como si hubiera dejado de
  // comerciar.
  if (parsed.count === 500 || rows.length >= 500) {
    throw new Error(
      `${label} ${flow.code} ${year}: la respuesta llego al tope de 500 filas del nivel gratuito; ` +
        'el desglose de este año se truncó y no se puede confiar en él sin estrechar más el filtro.',
    );
  }
  const retrievedAt = `${new Date().toISOString().slice(0, 19)}Z`;
  return {
    year,
    rows,
    bytes,
    url,
    sha256: createHash('sha256').update(bytes).digest('hex'),
    retrievedAt,
  };
}

interface Point {
  readonly period: string;
  readonly value: string;
  readonly excerpt: string;
  readonly sourceUrl: string;
  readonly upstreamSha256: string;
  readonly retrievedAt: string;
}

/** Una serie con sus puntos, ordenada por valor acumulado descendente (para el recorte a TOP_N). */
interface Ranked<K> {
  readonly key: K;
  readonly total: number;
  readonly points: Point[];
}

function accumulate<K>(
  fetches: readonly YearFetch[],
  keyOf: (row: Row) => K | undefined,
): Map<K, Point[]> {
  const byKey = new Map<K, Point[]>();
  for (const fetched of fetches) {
    for (const row of fetched.rows) {
      if (!isAggregateRow(row)) continue;
      const key = keyOf(row);
      if (key === undefined) continue;
      if (row.primaryValue === null) continue;
      const list = byKey.get(key) ?? [];
      list.push({
        period: String(fetched.year),
        value: String(row.primaryValue),
        excerpt: JSON.stringify(row),
        sourceUrl: fetched.url,
        upstreamSha256: fetched.sha256,
        retrievedAt: fetched.retrievedAt,
      });
      byKey.set(key, list);
    }
  }
  return byKey;
}

function rankTopN<K>(byKey: Map<K, Point[]>, topN: number): Array<Ranked<K>> {
  const ranked = [...byKey.entries()].map(([key, points]) => ({
    key,
    total: points.reduce((sum, point) => sum + Number(point.value), 0),
    points: points.slice().sort((a, b) => Number(a.period) - Number(b.period)),
  }));
  ranked.sort((a, b) => b.total - a.total);
  return ranked.slice(0, topN);
}

async function collectByPartner(
  flow: Flow,
  years: readonly number[],
  partnerNames: ReadonlyMap<number, string>,
): Promise<unknown[]> {
  const fetches: YearFetch[] = [];
  for (const year of years) {
    // Sin partnerCode: el registro devuelve todos los socios del año en una
    // sola respuesta en vez de uno por petición. `motCode=0&customsCode=C00`
    // pide directamente la fila agregada que se iba a filtrar de todos modos
    // (ver `isAggregateRow`), y evitar los cientos de filas por modo de
    // transporte y procedimiento aduanero es lo que mantiene la respuesta
    // bajo el tope de 500 filas del nivel gratuito.
    fetches.push(await fetchYear(flow, year, '&cmdCode=TOTAL&motCode=0&customsCode=C00', 'socios'));
    console.log(`  socios ${flow.code} ${year}`);
    await sleep(PAUSE_MS);
  }
  // partnerCode 0 es «Mundo», el mismo total que ya cubre foreign-trade.json;
  // se excluye aquí para no duplicar esa serie con otro nombre.
  const byPartner = accumulate(fetches, (row) => (row.partnerCode !== 0 ? row.partnerCode : undefined));
  const top = rankTopN(byPartner, TOP_N);
  console.log(`  ${flow.code}: ${top.length} socios publicados de ${byPartner.size} declarados`);

  return top.map(({ key: partnerCode, points }) => {
    const partnerName = partnerNames.get(partnerCode) ?? `Socio ${partnerCode}`;
    const iso = partnerName
      .toUpperCase()
      .replace(/[^A-Z]/gu, '')
      .slice(0, 12);
    const slug = iso.length >= 2 ? iso : `P${partnerCode}`;
    return {
      indicatorCode: `COMTRADE_PARTNER_${flow.code}_${slug}_USD`,
      flowCode: flow.code,
      partnerCode,
      partnerName,
      name: `${flow.verb} de Bolivia a/desde ${partnerName}, declaradas ante Naciones Unidas`,
      unit: 'USD',
      publisher: PUBLISHER,
      frequency: 'ANNUAL',
      points,
    };
  });
}

async function collectByProduct(
  flow: Flow,
  years: readonly number[],
  chapterNames: ReadonlyMap<string, string>,
): Promise<unknown[]> {
  const fetches: YearFetch[] = [];
  for (const year of years) {
    // cmdCode=AG2 trae los 97 capitulos de dos digitos en una sola respuesta;
    // el mismo filtro de socios evita el mismo tope de 500 filas, que 2025
    // alcanza sin él.
    fetches.push(
      await fetchYear(flow, year, '&partnerCode=0&cmdCode=AG2&motCode=0&customsCode=C00', 'productos'),
    );
    console.log(`  productos ${flow.code} ${year}`);
    await sleep(PAUSE_MS);
  }
  const byChapter = accumulate(fetches, (row) => (/^\d{2}$/u.test(row.cmdCode) ? row.cmdCode : undefined));
  const top = rankTopN(byChapter, TOP_N);
  console.log(`  ${flow.code}: ${top.length} capitulos publicados de ${byChapter.size} declarados`);

  return top.map(({ key: hsCode, points }) => {
    const hsName = chapterNames.get(hsCode) ?? `Capítulo ${hsCode}`;
    return {
      indicatorCode: `COMTRADE_PRODUCT_${flow.code}_HS${hsCode}_USD`,
      flowCode: flow.code,
      hsCode,
      hsName,
      name: `${flow.verb} de Bolivia, capítulo ${hsCode} (${hsName}), declaradas ante Naciones Unidas`,
      unit: 'USD',
      publisher: PUBLISHER,
      frequency: 'ANNUAL',
      points,
    };
  });
}

async function main(): Promise<void> {
  const closed = new Date().getUTCFullYear() - 1;
  const years: number[] = [];
  for (let year = FIRST_YEAR; year <= closed; year += 1) years.push(year);
  console.log(`\ncomercio exterior detallado  (${FIRST_YEAR}-${closed})`);

  const [partnerNames, chapterNames] = await Promise.all([fetchPartnerNames(), fetchChapterNames()]);
  await sleep(PAUSE_MS);

  const partnerSeries: unknown[] = [];
  const productSeries: unknown[] = [];
  for (const flow of FLOWS) {
    partnerSeries.push(...(await collectByPartner(flow, years, partnerNames)));
    productSeries.push(...(await collectByProduct(flow, years, chapterNames)));
  }

  writeFileSync(PARTNERS_SEED, `${JSON.stringify({ series: partnerSeries }, null, 2)}\n`, 'utf-8');
  writeFileSync(PRODUCTS_SEED, `${JSON.stringify({ series: productSeries }, null, 2)}\n`, 'utf-8');
  console.log(`  -> ${partnerSeries.length} series de socios, ${productSeries.length} series de productos`);
}

main().catch((error: unknown) => {
  process.stderr.write(
    `${error instanceof Error ? error.message : 'Comtrade detail collection failed'}\n`,
  );
  process.exitCode = 1;
});
