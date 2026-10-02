import {
  describe,
  download,
  fail,
  plainValue,
  writeFamily,
  yearDate,
  type AccountSeries,
} from './public-accounts-seed';

/**
 * Cuánto cuesta sostener el precio de los combustibles.
 *
 * El FMI calcula, país por país, la subvención a los combustibles fósiles en dos sentidos.
 * La **explícita** es la que el Estado paga: la diferencia entre lo que cuesta el
 * combustible y lo que el consumidor paga. La **implícita** suma lo que no se cobra y
 * debería: el costo del aire contaminado, del clima y de la congestión, más los impuestos
 * al consumo que no se aplican. Se publica en proporción del PIB.
 *
 * No es el gasto presupuestario: es una serie modelada por el FMI con precios
 * internacionales, y el último año es una estimación suya. El Ministerio de Economía no
 * publica el costo de la subvención como serie, así que esta es la única continua; el
 * tablero la rotula como estimación del FMI y no como cifra del Tesoro.
 *
 * Como en las series del FMI que ya se cargan, no se guardan los años posteriores al
 * último cerrado: una proyección no es una medición.
 *
 * Se ejecuta con `yarn fiscal:fuel-subsidies`.
 */

const FAMILY = 'subsidios-combustibles';
const SOURCE =
  'https://api.imf.org/external/sdmx/2.1/data/IMF.STA,FFS/BOL.EX+IM.ALL+OIL+NGA.POGDP_PT.A';

const KINDS: Readonly<Record<string, { code: string; label: string }>> = {
  EX: { code: 'EXPLICITA', label: 'Subvención explícita (lo que paga el Estado)' },
  IM: { code: 'IMPLICITA', label: 'Subvención implícita (costos no cobrados)' },
};
const FUELS: Readonly<Record<string, { code: string; label: string }>> = {
  ALL: { code: 'TOTAL', label: 'todos los combustibles fósiles' },
  OIL: { code: 'PETROLEO', label: 'derivados del petróleo' },
  NGA: { code: 'GAS_NATURAL', label: 'gas natural' },
};

interface Sdmx {
  readonly dataSets: ReadonlyArray<{
    readonly series: Record<string, { readonly observations: Record<string, readonly unknown[]> }>;
  }>;
  readonly structure: {
    readonly dimensions: {
      readonly series: ReadonlyArray<{ id: string; values: ReadonlyArray<{ id: string }> }>;
      readonly observation: ReadonlyArray<{ id: string; values: ReadonlyArray<{ id: string }> }>;
    };
  };
}

async function main(): Promise<void> {
  const file = await download(SOURCE, 'application/json');
  const document = JSON.parse(file.bytes.toString('utf-8')) as Sdmx;
  const dimensions = document.structure.dimensions.series;
  const years = document.structure.dimensions.observation[0]?.values ?? [];
  const closed = new Date().getUTCFullYear() - 1;

  const series: AccountSeries[] = [];
  for (const [key, body] of Object.entries(document.dataSets[0]?.series ?? {})) {
    const ids = key.split(':').map((position, index) => dimensions[index]?.values[Number(position)]?.id ?? '');
    const [, kindId = '', fuelId = '', transformation = ''] = ids;
    const kind = KINDS[kindId];
    const fuel = FUELS[fuelId];
    if (!kind || !fuel || transformation !== 'POGDP_PT') continue;
    const points = Object.entries(body.observations)
      .map(([position, observation]) => ({
        year: Number(years[Number(position)]?.id),
        value: plainValue(String(observation[0])),
      }))
      .filter((entry) => Number.isInteger(entry.year) && entry.year <= closed && entry.value !== null)
      .sort((left, right) => left.year - right.year)
      .map((entry) => [yearDate(entry.year), entry.value as string] as const);
    if (points.length < 3) continue;
    series.push({
      indicatorCode: `FISC_IMF_FFS_${kind.code}_${fuel.code}_PCT_GDP`,
      name: `${kind.label} · ${fuel.label} (% del PIB)`,
      family: FAMILY,
      topic: 'subsidio',
      place: 'BOL',
      concept: `${kind.code}_${fuel.code}`,
      perimeter: 'FMI',
      unit: 'PCT_GDP',
      frequency: 'ANNUAL',
      publisher: 'Fondo Monetario Internacional',
      locator: { dataflow: 'IMF.STA,FFS', key: ids.join('.') },
      sourceUrl: SOURCE,
      upstreamSha256: file.sha256,
      retrievedAt: file.retrievedAt,
      points,
    });
  }
  if (series.length !== 6) throw new Error(`se esperaban 6 series del FMI y salieron ${series.length}`);
  series.sort((left, right) => left.indicatorCode.localeCompare(right.indicatorCode));
  const path = writeFamily(FAMILY, series);
  for (const one of series) console.log(describe(one));
  console.log(`  -> ${series.length} series en ${path}`);
}

main().catch(fail);
