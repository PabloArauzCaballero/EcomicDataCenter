import { FORBES, WEALTH_PREFIX } from './wealth-sources';
import { codeOf, download, type SeriesBook } from './business-common';

/**
 * Las fortunas de origen boliviano en la lista anual de Forbes.
 *
 * Nadie entra por decisión de este repositorio. La búsqueda tiene dos pasos y
 * los dos son de Forbes: primero, en cada lista anual, quien tenga ciudadanía
 * boliviana o una biografía que lo diga boliviano o nacido en Bolivia; después,
 * en la ficha de cada candidato, el país de nacimiento o de origen que Forbes
 * registra. La biografía sola no basta —los Rodríguez de Gloria aparecen porque
 * «tienen negocios en Bolivia»— y la ficha sola no se puede pedir para tres mil
 * personas por año.
 */

interface ListEntry {
  readonly uri?: string | undefined;
  readonly rank?: number | undefined;
  readonly personName?: string | undefined;
  readonly finalWorth?: number | undefined;
  readonly countryOfCitizenship?: string | undefined;
  readonly source?: string | undefined;
  readonly year?: number | undefined;
  readonly month?: number | undefined;
  readonly bio?: string | undefined;
  readonly bios?: readonly string[] | undefined;
  readonly abouts?: readonly string[] | undefined;
}

/**
 * Una lista anual ya aligerada: sin biografías, que pesan diez veces más que
 * las cifras y no hacen falta pasada la búsqueda de candidatos.
 */
interface YearList {
  readonly year: number;
  readonly url: string;
  readonly sha256: string;
  readonly retrievedAt: string;
  readonly entries: readonly ListEntry[];
  readonly candidates: readonly string[];
}

const BOLIVIAN = /\bBolivian\b|born in Bolivia/u;

const biography = (entry: ListEntry): string =>
  [entry.bio ?? '', ...(entry.bios ?? []), ...(entry.abouts ?? [])].join(' ');

async function yearList(year: number): Promise<YearList> {
  const url = FORBES.list(year);
  const file = await download(url, { headers: { Accept: 'application/json' } });
  const parsed = JSON.parse(file.bytes.toString('utf-8')) as {
    personList?: { personsLists?: ListEntry[] };
  };
  const entries = parsed.personList?.personsLists ?? [];
  if (entries.length < FORBES.minimumPerList) {
    throw new Error(`Forbes ${year}: la lista trajo ${entries.length} personas`);
  }
  const candidates = entries
    .filter((entry) => entry.countryOfCitizenship === 'Bolivia' || BOLIVIAN.test(biography(entry)))
    .map((entry) => entry.uri ?? '')
    .filter(Boolean);
  const lean = entries.map(
    ({ uri, rank, personName, finalWorth, countryOfCitizenship, source, year, month }) => ({
      uri,
      rank,
      personName,
      finalWorth,
      countryOfCitizenship,
      source,
      year,
      month,
    }),
  );
  return {
    year,
    url,
    sha256: file.sha256,
    retrievedAt: file.retrievedAt,
    entries: lean,
    candidates,
  };
}

/** Si la ficha de Forbes ata a la persona con Bolivia por nacimiento, origen o pasaporte. */
async function tiedToBolivia(uri: string): Promise<boolean> {
  const file = await download(FORBES.profile(uri), { headers: { Accept: 'application/json' } });
  const profile = (JSON.parse(file.bytes.toString('utf-8')) as { person?: Record<string, unknown> })
    .person;
  if (!profile) throw new Error(`Forbes: la ficha de ${uri} no se pudo leer`);
  if (profile.birthCountry === 'Bolivia' || profile.countryOfCitizenship === 'Bolivia') return true;
  return /"question":"Country of Origin","answer":"Bolivia"/u.test(JSON.stringify(profile));
}

/** La fila de la lista tal como Forbes la publica, que es lo que se cita. */
function quote(entry: ListEntry): string {
  return JSON.stringify({
    personName: entry.personName,
    year: entry.year,
    month: entry.month,
    rank: entry.rank,
    finalWorth: entry.finalWorth,
    countryOfCitizenship: entry.countryOfCitizenship,
    source: entry.source,
  });
}

export async function collectForbes(book: SeriesBook): Promise<string[]> {
  const lists: YearList[] = [];
  for (let year = FORBES.firstYear; year <= FORBES.lastYear; year += 1) {
    lists.push(await yearList(year));
  }
  const candidates = new Set(lists.flatMap((list) => list.candidates));
  const people: string[] = [];
  for (const uri of [...candidates].sort()) {
    if (await tiedToBolivia(uri)) people.push(uri);
  }

  const notes: string[] = [];
  for (const uri of people) {
    const rows = lists.flatMap((list) =>
      list.entries.filter((entry) => entry.uri === uri).map((entry) => ({ list, entry })),
    );
    const latest = rows.at(-1)?.entry;
    if (!latest?.personName) continue;
    const slug = codeOf(latest.personName, 50);
    const traits = `ciudadania=${latest.countryOfCitizenship ?? 's/d'}; origen=Bolivia; fuente_riqueza=${latest.source ?? 's/d'}`;
    for (const { list, entry } of rows) {
      if (entry.finalWorth === undefined) {
        notes.push(`Forbes ${list.year}: ${uri} sin patrimonio publicado`);
        continue;
      }
      book.add(
        {
          indicatorCode: `${WEALTH_PREFIX}FORBES_NETWORTH_${slug}`,
          name: `${latest.personName}: patrimonio según Forbes {${traits}}`,
          group: slug,
          groupLabel: latest.personName,
          measure: 'Patrimonio neto estimado por Forbes',
          level: 'PERSON',
          unit: 'MILLION_USD',
          basis:
            'Patrimonio neto que Forbes estima al cierre de su lista anual (marzo o abril), en millones de dólares. Es una estimación de la revista sobre activos conocidos, no una declaración patrimonial ni ingresos.',
          publisher: FORBES.publisher,
        },
        {
          period: String(list.year),
          value: String(entry.finalWorth),
          excerpt: quote(entry),
          sourceUrl: list.url,
          upstreamSha256: list.sha256,
          retrievedAt: list.retrievedAt,
        },
      );
    }
    console.log(`  Forbes: ${latest.personName} en ${rows.length} listas`);
  }

  for (const known of FORBES.expected) {
    for (let year = known.from; year <= known.to; year += 1) {
      const list = lists.find((candidate) => candidate.year === year);
      const found =
        people.includes(known.uri) && list?.entries.some((entry) => entry.uri === known.uri);
      if (!found) throw new Error(`Forbes ${year}: ${known.uri} debía estar y no se encontró`);
    }
  }
  return notes;
}
