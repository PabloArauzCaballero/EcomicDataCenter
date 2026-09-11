/**
 * Reads the national place delivery and turns it into seed records.
 *
 * The delivery arrives as nine signed ZIP parts holding eighty batches of
 * candidates. This module never opens the ZIPs: it reads the batches once they
 * are unpacked, so the step that verifies the signatures stays visible in the
 * operator's shell instead of hiding inside a build.
 *
 * Two rules govern every record it emits, and both exist because the corpus is
 * a second delivery over a database that already holds places:
 *
 *  - A place the observatory already holds is dropped, not re-emitted. The
 *    loader is idempotent by payload hash, and the payload of this delivery has
 *    a different shape from the one the three-city corpus was written with, so
 *    the hash would not recognise a place it already stores. Twenty-four
 *    thousand pharmacies would land a second time and every count in the public
 *    report would be wrong.
 *  - A family the catalogue does not define stops the build. The catalogue is
 *    what says which group a place belongs to and whether a Bolivian regulator
 *    licenses its activity; guessing either would put an invented licence
 *    status in front of a reader.
 */

import { readdir, readFile } from 'node:fs/promises';
import { join } from 'node:path';

/** Overture ships a bare UUID; the delivery prefixes it with the publisher. */
const OVERTURE = 'overture';

const PUBLISHERS = {
  overture: 'Overture Maps Foundation',
  osm: 'OpenStreetMap contributors',
};

/**
 * The places the observatory already holds, read from the corpus on disk.
 *
 * Keyed by Overture's own identifier because that is the only key the two
 * deliveries share: the three-city corpus stored the bare UUID, this one
 * stores it prefixed. OpenStreetMap records cannot collide with that corpus —
 * it had no OpenStreetMap in it — so they are not looked up.
 */
export async function readHeldPlaceIds(directory) {
  const held = new Set();
  let files;
  try {
    files = (await readdir(directory)).filter((name) => name.endsWith('.json'));
  } catch {
    return held;
  }
  for (const file of files) {
    const seed = JSON.parse(await readFile(join(directory, file), 'utf8'));
    for (const place of seed.places ?? []) held.add(place.placeId);
  }
  return held;
}

/**
 * A list of contact details with the blanks taken out.
 *
 * Fifteen telephones and one website arrive in this delivery as an empty
 * string. An empty string is not a telephone: storing it would put a contact
 * detail on a place that has none, and a reader counting how many places can
 * be reached would count those sixteen among them. The entries that carry
 * something are kept exactly as the publisher wrote them, trimmed only of the
 * surrounding space the seed would drop anyway.
 */
function contactList(values) {
  return (values ?? [])
    .map((value) => (typeof value === 'string' ? value.trim() : ''))
    .filter((value) => value.length > 0);
}

/** The address the publisher printed, when it printed one worth keeping. */
function addressOf(record) {
  const first = (record.addresses ?? [])[0];
  if (!first) return { address: null, locality: null };
  const freeform = typeof first.freeform === 'string' ? first.freeform.trim() : '';
  const locality = typeof first.locality === 'string' ? first.locality.trim() : '';
  return {
    address: freeform.length > 0 ? freeform.slice(0, 300) : null,
    locality: locality.length > 0 ? locality.slice(0, 160) : null,
  };
}

/**
 * One place, carrying what the delivery says and nothing it does not.
 *
 * There is no city and no department. The delivery publishes neither: its
 * `region` column is empty for 36.991 of the 37.278 Overture records and holds
 * `S`, `L` and `H` in most of the rest, and the OpenStreetMap half carries no
 * locality at all. What is kept is the locality Overture itself printed, named
 * `locality` so that nobody reads it as an administrative boundary it never
 * claimed to be.
 */
function toPlace(record, family) {
  const { address, locality } = addressOf(record);
  return {
    placeId: record.id,
    publisherRecordId: record.id_original,
    publisher: PUBLISHERS[record.fuente],
    name: record.nombre,
    locality,
    address,
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
    categoryKey: record.categoria_clave_utilizada,
    taxonomyHierarchy: record.taxonomy?.hierarchy ?? [],
    basicCategory: record.basic_category ?? record.categoria_osm ?? null,
    confidence: typeof record.confidence === 'number' ? record.confidence : null,
    positionMethod: record.position_method ?? null,
    dataLevel: record.nivel_datos,
    phones: contactList(record.phones),
    emails: contactList(record.emails),
    websites: contactList(record.websites),
    socials: contactList(record.socials),
    warnings: record.advertencias ?? [],
    sourceDatasetUrl: record.source_dataset_url,
    licence: record.license_dataset,
    observationId: record.observacion_id,
  };
}

/** Every batch of the unpacked delivery, in the order the parts number them. */
async function listBatches(deliveryDirectory) {
  const parts = (await readdir(deliveryDirectory, { withFileTypes: true }))
    .filter((entry) => entry.isDirectory() && entry.name.startsWith('parte_'))
    .map((entry) => entry.name)
    .sort();
  const batches = [];
  for (const part of parts) {
    const candidates = join(deliveryDirectory, part, 'candidatos');
    const files = (await readdir(candidates)).filter((name) => name.endsWith('.json')).sort();
    for (const file of files) batches.push(join(candidates, file));
  }
  return batches;
}

/**
 * Reads the whole delivery, one batch at a time.
 *
 * Returns the places to load, the identifiers dropped because the observatory
 * already holds them, and the families the catalogue does not define. The
 * caller decides what to do with the third list; this function does not choose
 * to continue without it.
 */
export async function readNationalDelivery(deliveryDirectory, catalogue, heldPlaceIds) {
  const places = [];
  const missingFamilies = new Map();
  let read = 0;
  let alreadyHeld = 0;

  for (const batch of await listBatches(deliveryDirectory)) {
    const parsed = JSON.parse(await readFile(batch, 'utf8'));
    for (const record of parsed.registros) {
      read += 1;
      if (record.fuente === OVERTURE && heldPlaceIds.has(record.id_original)) {
        alreadyHeld += 1;
        continue;
      }
      const family = catalogue.get(record.familia_codigo);
      if (!family) {
        const seen = missingFamilies.get(record.familia_codigo) ?? {
          records: 0,
          categories: new Set(),
        };
        seen.records += 1;
        seen.categories.add(record.categoria_clave_utilizada);
        missingFamilies.set(record.familia_codigo, seen);
        continue;
      }
      places.push(toPlace(record, family));
    }
  }

  return { places, missingFamilies, read, alreadyHeld };
}
