/**
 * Reads the Cochabamba and La Paz expansion, and turns it into seed records.
 *
 * A second delivery, and a different shape from the national one: it reads
 * OpenStreetMap live instead of a distributed extract, so it names no dataset
 * file, carries the tags each place was classified from, and — unlike the
 * national corpus — resolves a municipality and a department for every row.
 *
 * It arrives already filtered against the 76.412-record national package, and
 * that filter verifies: none of its 5.721 identifiers appears there, nor among
 * the 35.101 auxiliary observations. What nobody filtered against is the corpus
 * the observatory actually holds, because that corpus is Overture and this one
 * is OpenStreetMap, so the two cannot collide by identifier. They can be the
 * same shop, and they are, which is what `resemblesHeldPlace` is for.
 */

import { readFile } from 'node:fs/promises';

const STOP = new Set(['de', 'la', 'el', 'los', 'las', 'del', 'y', 'en', 'sa', 'srl', 'ltda']);

/** Words worth comparing, with the accents and the filler taken out. */
function significantWords(name) {
  const plain = name
    .normalize('NFD')
    .replace(/[̀-ͯ]/gu, '')
    .toLowerCase()
    .replace(/[^a-z0-9 ]/gu, ' ');
  return new Set(plain.split(/\s+/u).filter((word) => word.length > 2 && !STOP.has(word)));
}

function metresBetween(oneLat, oneLon, otherLat, otherLon) {
  const north = (otherLat - oneLat) * 111320;
  const east = (otherLon - oneLon) * 111320 * Math.cos((oneLat * Math.PI) / 180);
  return Math.hypot(north, east);
}

/**
 * The places the observatory holds, indexed by a coarse grid.
 *
 * Half a thousandth of a degree is about 55 metres, so the nine cells around a
 * point contain everything within the distance this comparison cares about.
 * Without the grid the comparison is 5.721 × 26.671 distances.
 */
export function indexHeldPlaces(places) {
  const grid = new Map();
  for (const place of places) {
    const key = `${Math.round(place.latitude * 2000)}:${Math.round(place.longitude * 2000)}`;
    const cell = grid.get(key);
    if (cell) cell.push(place);
    else grid.set(key, [place]);
  }
  return grid;
}

/**
 * The held place this one probably is, or null.
 *
 * Two conditions, both needed: close enough that they cannot be two premises,
 * and named similarly enough that they are not two different shops in one
 * building. Half the significant words in common is the threshold, which is
 * what separates «Heladería Dumbo» from «Dumbo» at five metres — the same
 * business — from two unrelated tenants of the same gallery.
 *
 * It returns a suspicion and never merges. Merging would delete a real second
 * branch on the same block, which is the decision the three-city corpus already
 * took and there is no reason to take the opposite one here.
 */
export function resemblanceTo(grid, record, limitMetres = 40, sharedWords = 0.5) {
  const words = significantWords(record.nombre);
  if (words.size === 0) return null;
  let best = null;
  const cellLat = Math.round(record.latitud * 2000);
  const cellLon = Math.round(record.longitud * 2000);
  for (let downLat = -1; downLat <= 1; downLat += 1) {
    for (let acrossLon = -1; acrossLon <= 1; acrossLon += 1) {
      for (const held of grid.get(`${cellLat + downLat}:${cellLon + acrossLon}`) ?? []) {
        const metres = metresBetween(
          record.latitud,
          record.longitud,
          held.latitude,
          held.longitude,
        );
        if (metres > limitMetres) continue;
        let shared = 0;
        for (const word of words) if (held.words.has(word)) shared += 1;
        const overlap = shared / (words.size + held.words.size - shared);
        if (overlap >= sharedWords && (best === null || overlap > best.overlap)) {
          best = { overlap, placeId: held.placeId, name: held.name, metres };
        }
      }
    }
  }
  if (!best) return null;
  return { placeId: best.placeId, name: best.name, metres: Math.round(best.metres * 10) / 10 };
}

/** The held corpus, read from the seed on disk with the words precomputed. */
export async function readHeldPlacesForComparison(directory, readdir, join) {
  const files = (await readdir(directory)).filter((name) => name.endsWith('.json'));
  const places = [];
  for (const file of files) {
    const seed = JSON.parse(await readFile(join(directory, file), 'utf8'));
    for (const place of seed.places ?? []) {
      places.push({
        placeId: place.placeId,
        name: place.name,
        words: significantWords(place.name),
        latitude: place.latitude,
        longitude: place.longitude,
      });
    }
  }
  return places;
}

/** A contact list with the blanks taken out, as the national reader does. */
function contactList(values) {
  return (values ?? [])
    .map((value) => (typeof value === 'string' ? value.trim() : ''))
    .filter((value) => value.length > 0);
}

/**
 * The street address the publisher tagged, written out.
 *
 * OpenStreetMap publishes an address in pieces — street, number, neighbourhood
 * — and never as a line. The line is assembled from the pieces it did publish
 * and from nothing else: no city is appended, no country, no invented comma
 * where a piece is missing.
 */
function addressFrom(tagged) {
  const parts = [];
  const street = tagged['addr:street'];
  const number = tagged['addr:housenumber'] ?? tagged['addr:streetnumber'];
  if (street) parts.push(number ? `${street} ${number}` : street);
  else if (tagged['addr:housename']) parts.push(tagged['addr:housename']);
  if (tagged['addr:neighbourhood']) parts.push(tagged['addr:neighbourhood']);
  const line = parts.join(', ').trim();
  return line.length > 0 ? line.slice(0, 300) : null;
}

/** One place of the expansion, in the shape the national seed already uses. */
export function toExpansionPlace(record, family, resemblance) {
  const tagged = record.direccion_fuente ?? {};
  return {
    placeId: record.id,
    publisherRecordId: record.id_original,
    publisher: 'OpenStreetMap contributors',
    name: record.nombre,
    locality: record.municipio_fuente,
    department: record.departamento,
    address: addressFrom(tagged),
    latitude: record.latitud,
    longitude: record.longitud,
    entityGroup: family.group,
    entityFamily: record.familia_codigo,
    commercialRole: family.commercialRole,
    isRegulated: family.isRegulated,
    officialValidationSource: family.officialValidationSource,
    validationPriority: family.isRegulated ? 'HIGH' : 'NORMAL',
    genericFamily: record.familia_generica,
    classificationMethod: record.metodo_clasificacion,
    categoryKey: record.clasificacion_tag,
    taxonomyHierarchy: [],
    basicCategory: null,
    confidence: null,
    positionMethod: record.metodo_posicion,
    dataLevel: record.nivel_datos,
    phones: contactList(record.phones),
    emails: contactList(record.emails),
    websites: contactList(record.websites),
    socials: contactList(record.socials),
    // Las dos ampliaciones nombran igual la misma lista: la primera
    // `advertencias`, la de las otras capitales `alertas_control`.
    warnings: record.advertencias ?? record.alertas_control ?? [],
    sourceDatasetUrl: null,
    sourceRecordUrl: record.source_url ?? null,
    snapshotTakenAt: record.timestamp_osm_base ?? null,
    sourceTags: record.tags_fuente ?? null,
    openingHours: record.horario_publicado ?? null,
    resemblesHeldPlace: resemblance,
    licence: record.licencia_datos,
    observationId: record.id,
  };
}

/**
 * Reads the expansion file and classifies every row it can.
 *
 * Same two rules as the national reader: a family the catalogue does not define
 * stops the build, and what the observatory already holds does not come back.
 * Here the second rule cannot work by identifier, so it works by resemblance —
 * and it flags rather than drops, because a resemblance is not proof.
 */
export async function readExpansionDelivery(path, catalogue, heldGrid, options = {}) {
  const { stableOnly = false } = options;
  const parsed = JSON.parse(await readFile(path, 'utf8'));
  const places = [];
  const missingFamilies = new Map();
  let resembling = 0;
  let awaitingRefinement = 0;
  let withoutOpenLicence = 0;

  for (const record of parsed.registros) {
    /*
     * Solo entra lo que llega bajo una licencia abierta comprobada. La entrega
     * de las otras capitales trae 113 fichas de SEPREC cuya propia nota dice
     * `sin_licencia_abierta_expresa_verificada`, y el informe que lee este
     * corpus es publico. Republicar un registro mercantil ajeno sin saber bajo
     * que condiciones se puede es una decision que no toma un cargador.
     */
    if (record.fuente !== 'osm') {
      withoutOpenLicence += 1;
      continue;
    }
    /*
     * Una familia generica es una que el catalogo de 2.330 va a refinar. Aqui
     * los datos son inmutables, asi que cargarla hoy obliga a superarla manana.
     */
    if (stableOnly && record.familia_generica) {
      awaitingRefinement += 1;
      continue;
    }
    const family = catalogue.get(record.familia_codigo);
    if (!family) {
      const seen = missingFamilies.get(record.familia_codigo) ?? {
        records: 0,
        categories: new Set(),
      };
      seen.records += 1;
      seen.categories.add(record.clasificacion_tag);
      missingFamilies.set(record.familia_codigo, seen);
      continue;
    }
    const resemblance = resemblanceTo(heldGrid, record);
    if (resemblance) resembling += 1;
    places.push(toExpansionPlace(record, family, resemblance));
  }

  return {
    places,
    missingFamilies,
    read: parsed.registros.length,
    resembling,
    awaitingRefinement,
    withoutOpenLicence,
  };
}
