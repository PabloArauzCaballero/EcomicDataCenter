/**
 * Reads a SEPREC delivery of registered establishments.
 *
 * A third shape, and the one that needs the most taking apart. It is not
 * cartography: every row says a company declared a domicile to the Bolivian
 * commercial register, which is not the same as anyone having seen premises
 * open. The delivery says so itself on every record, and so does this module.
 *
 * Four things it does that the mapping readers do not need to do:
 *
 *  - It drops the contact details. Practically every row carries a telephone
 *    and an e-mail, and 61% of the rows are sole traders, where those belong to
 *    a person and not to a switchboard. The report that reads this corpus is
 *    public. The name, the declared domicile and the stated purpose come in
 *    whole — that much is the register, and the register is public.
 *  - It refuses a position that contradicts its own row. Nine records carry a
 *    longitude off the planet (−423, −2223, +296: a Santa Cruz longitude with
 *    360 added or subtracted, once or six times), one sits in Peru, and
 *    eighteen sit more than 25 km from the middle of the municipality they
 *    name — one of them 538 km away. When the coordinate and the municipality
 *    disagree, one of the two is wrong and nothing here can say which.
 *  - It writes the municipality the way the rest of the corpus writes it.
 *    SEPREC publishes `SANTA CRUZ DE LA SIERRA`; the other deliveries publish
 *    `Santa Cruz de la Sierra`, and a report that groups by that string would
 *    have shown the same city twice.
 *  - It records that the coordinate is derived. The delivery calls these
 *    declared coordinates, and 78% of them carry twelve or more decimal places
 *    — nanometre precision, which nobody declares. They are computed, and the
 *    warning travels with the row so a reader does not take a jittered point
 *    for a surveyed address.
 */

import { readFile } from 'node:fs/promises';
import { resemblanceTo } from './read-expansion-delivery.mjs';

/** Filed under the group the catalogue uses for whatever it does not define. */
const UNCLASSIFIED = {
  group: 'OTRA_ENTIDAD',
  commercialRole: 'OTHER',
  isRegulated: false,
  officialValidationSource: null,
};

const LICENCE =
  'sin_licencia_abierta_expresa_verificada; informacion_publica_del_directorio_SEPREC';
/** Las minusculas que el castellano no capitaliza dentro de un nombre propio. */
const MINOR = new Set(['de', 'del', 'la', 'las', 'los', 'y', 'el']);
/*
 * El registro escribe en mayusculas y sin tildes; el resto del corpus escribe
 * `Potosí`. Sin esto el tablero mostraria Potosi y Potosí como dos ciudades.
 */
const ACCENTED = new Map([['Potosi', 'Potosí']]);
/*
 * Un domicilio declarado como vivienda no es un establecimiento: es la casa de
 * alguien. Publicarlo con la razon social —que en una empresa unipersonal es el
 * nombre de una persona— pone en un mapa publico donde vive esa persona.
 */
const RESIDENCE = /particular|vivienda|\bcasa\b|domicilio/iu;

/**
 * El municipio escrito como lo escribe el resto del corpus.
 *
 * No es cosmetica: el informe agrupa por esta cadena, y `SANTA CRUZ DE LA
 * SIERRA` junto a `Santa Cruz de la Sierra` son dos ciudades distintas para
 * cualquier `GROUP BY`.
 */
export function inTitleCase(name) {
  const titled = name
    .trim()
    .toLocaleLowerCase('es')
    .split(/\s+/u)
    .map((word, index) =>
      index > 0 && MINOR.has(word) ? word : word.charAt(0).toLocaleUpperCase('es') + word.slice(1),
    )
    .join(' ');
  return ACCENTED.get(titled) ?? titled;
}

function metresBetween(oneLat, oneLon, otherLat, otherLon) {
  const north = (otherLat - oneLat) * 111320;
  const east = (otherLon - oneLon) * 111320 * Math.cos((oneLat * Math.PI) / 180);
  return Math.hypot(north, east);
}

/** La mediana, que un punto a 500 km no arrastra como si fuera la media. */
function median(values) {
  const sorted = [...values].sort((one, other) => one - other);
  return sorted[Math.floor(sorted.length / 2)];
}

/**
 * El centro de cada municipio, sacado de los propios registros que lo nombran.
 *
 * No hay poligonos municipales en la entrega ni en el repositorio, asi que la
 * unica referencia disponible es donde cae la mayoria de los que dicen estar en
 * ese municipio. Sirve para lo unico que se le pide: ver quien esta lejisimos.
 */
function municipalCentres(records) {
  const grouped = new Map();
  for (const record of records) {
    const cell = grouped.get(record.municipio);
    if (cell) cell.push(record);
    else grouped.set(record.municipio, [record]);
  }
  const centres = new Map();
  for (const [name, rows] of grouped) {
    centres.set(name, {
      latitude: median(rows.map((row) => row.latitud)),
      longitude: median(rows.map((row) => row.longitud)),
    });
  }
  return centres;
}

/** El domicilio declarado, armado con las piezas que el registro publico. */
function declaredAddress(declared) {
  const parts = [];
  const street = declared.nombreVia;
  if (street) {
    parts.push(declared.numeroDomicilio ? `${street} ${declared.numeroDomicilio}` : street);
  }
  const building = (declared.edificio ?? '').trim();
  // `S/N`, `0`, `-`, `N/A` y `SIN NOMBRE` son la forma que tiene un formulario
  // de decir que no hay edificio. Copiarlos seria publicar el hueco.
  if (building.length > 3 && !/^(s\/?n\.?|sin nombre|n\/a|ninguno)$/iu.test(building)) {
    parts.push(building);
  }
  if (declared.piso) parts.push(`piso ${declared.piso}`);
  const line = parts.join(', ').trim();
  return line.length > 0 ? line.slice(0, 300) : null;
}

/** Lo que hay que avisar de esta fila, medido y no supuesto. */
function warningsFor(record) {
  const warnings = ['registro_comercial_no_verifica_local_abierto'];
  const decimals = Math.max(
    String(record.latitud).split('.').at(-1)?.length ?? 0,
    String(record.longitud).split('.').at(-1)?.length ?? 0,
  );
  if (decimals >= 12) warnings.push('coordenada_calculada_precision_no_declarable');
  if (record.tipo_unidad_economica === 'EMPRESA UNIPERSONAL') {
    warnings.push('empresa_unipersonal_la_razon_social_puede_ser_una_persona');
  }
  return warnings;
}

/** One registered establishment, in the shape the place seed already uses. */
function toRegistryPlace(record, resemblance) {
  const declared = record.direccion ?? {};
  const purpose = (record.objeto_social ?? []).join(' ').trim();
  return {
    placeId: record.id,
    publisherRecordId: String(record.id_establecimiento_fuente ?? record.id),
    publisher: 'SEPREC',
    name: record.nombre.trim().slice(0, 300),
    locality: inTitleCase(record.municipio),
    department: inTitleCase(record.departamento),
    address: declaredAddress(declared),
    latitude: record.latitud,
    longitude: record.longitud,
    entityGroup: UNCLASSIFIED.group,
    entityFamily: record.familia_codigo,
    commercialRole: UNCLASSIFIED.commercialRole,
    isRegulated: UNCLASSIFIED.isRegulated,
    officialValidationSource: UNCLASSIFIED.officialValidationSource,
    validationPriority: 'NORMAL',
    genericFamily: record.familia_generica,
    classificationMethod: 'respaldo_generico_objeto_social_no_confirma_actividad_del_local',
    categoryKey: null,
    taxonomyHierarchy: [],
    basicCategory: null,
    confidence: null,
    positionMethod: 'coordenada_declarada_en_registro_no_entrada_verificada',
    dataLevel: 'REGISTRO_PUBLICO_UBICACION_DECLARADA',
    // Sin contactos, a proposito. Ver la cabecera de este archivo.
    phones: [],
    emails: [],
    websites: [],
    socials: [],
    warnings: warningsFor(record),
    sourceDatasetUrl: null,
    sourceRecordUrl: null,
    snapshotTakenAt: null,
    /*
     * El objeto social es lo unico que dice a que se dedica la sociedad, y sin
     * el la fila es un nombre en un mapa. Va aqui, que es donde el corpus
     * guarda lo que el publicador dijo en sus propias palabras.
     */
    sourceTags: purpose.length > 0 ? { objeto_social: purpose.slice(0, 2000) } : null,
    openingHours: null,
    resemblesHeldPlace: resemblance,
    licence: LICENCE,
    observationId: record.id,
  };
}

/**
 * Reads the delivery, keeping the rows whose position does not contradict them.
 *
 * `heldPlaceIds` are the identifiers the observatory already stores, so a
 * second delivery of the same register does not land twice.
 */
export async function readRegistryDelivery(path, heldPlaceIds, heldGrid, limitKm = 25) {
  const parsed = JSON.parse(await readFile(path, 'utf8'));
  const records = parsed.registros ?? parsed;
  const inCountry = [];
  const rejected = {
    offPlanet: 0,
    outsideCountry: 0,
    farFromMunicipality: 0,
    alreadyHeld: 0,
    residence: 0,
  };

  for (const record of records) {
    if (heldPlaceIds.has(record.id)) {
      rejected.alreadyHeld += 1;
      continue;
    }
    if (RESIDENCE.test(String(record.direccion?.edificio ?? ''))) {
      rejected.residence += 1;
      continue;
    }
    const { latitud: latitude, longitud: longitude } = record;
    if (!(latitude >= -90 && latitude <= 90 && longitude >= -180 && longitude <= 180)) {
      rejected.offPlanet += 1;
      continue;
    }
    if (!(latitude >= -23 && latitude <= -9 && longitude >= -70 && longitude <= -57)) {
      rejected.outsideCountry += 1;
      continue;
    }
    inCountry.push(record);
  }

  const centres = municipalCentres(inCountry);
  const places = [];
  let resembling = 0;
  for (const record of inCountry) {
    const centre = centres.get(record.municipio);
    const away =
      metresBetween(record.latitud, record.longitud, centre.latitude, centre.longitude) / 1000;
    if (away > limitKm) {
      rejected.farFromMunicipality += 1;
      continue;
    }
    const resemblance = heldGrid
      ? resemblanceTo(heldGrid, { ...record, nombre: record.nombre })
      : null;
    if (resemblance) resembling += 1;
    places.push(toRegistryPlace(record, resemblance));
  }

  return { places, rejected, resembling, read: records.length };
}
