/**
 * Lee los lugares de transporte que Overpass devuelve para Bolivia y los
 * convierte en filas del corpus de lugares.
 *
 * Es la primera entrega de este corpus que no llega como un archivo firmado
 * por un publicador: se pide en vivo, por clase de lugar (aerodromos,
 * terminales de bus, paradas, ferrocarril, puertos...), y cada respuesta se
 * guarda cruda con su fecha y su huella antes de leer nada, igual que hace la
 * ampliacion de Cochabamba y La Paz con OpenStreetMap en vivo.
 *
 * Tres cosas que esta entrega necesita y las anteriores no:
 *
 *  - Un mismo objeto de OpenStreetMap puede caer en mas de una consulta —una
 *    plataforma de autobus casa con `public_transport=platform` y a veces con
 *    `highway=bus_stop` en el mismo nodo—. Se deduplica por su identificador
 *    antes de clasificar, no despues.
 *  - Clasificar aqui es leer las etiquetas, no un codigo de familia que la
 *    entrega ya trajera: no hay entrega, hay una consulta y su resultado. La
 *    regla que decide la familia vive en `classify-transport-osm.mjs`.
 *  - Miles de nodos no llevan `name`. Un mapeador puede marcar una parada sin
 *    ponerle nombre, y esta lectura no le inventa uno: si no hay `name` ni
 *    `ref` publicado, la fila no entra, y se cuenta aparte.
 */

import { createHash } from 'node:crypto';
import { readFile } from 'node:fs/promises';
import {
  categoryKeyOf,
  classifyTransportFamily,
  isForeignByTags,
  nameOf,
  statedDepartment,
  withinCountry,
} from './classify-transport-osm.mjs';
import { addressFromTags, resemblanceTo } from './read-expansion-delivery.mjs';

const PHONE_TAGS = ['phone', 'contact:phone'];
const WEBSITE_TAGS = ['website', 'contact:website'];

function taggedValues(tags, keys, shortest, longest) {
  const values = [];
  for (const key of keys) {
    const tagged = tags[key];
    if (typeof tagged !== 'string') continue;
    for (const piece of tagged.split(';')) {
      const value = piece.trim();
      if (value.length >= shortest && value.length <= longest && !values.includes(value)) {
        values.push(value);
      }
    }
  }
  return values;
}

function writtenTags(tags) {
  const written = {};
  for (const [key, value] of Object.entries(tags ?? {})) {
    if (typeof value !== 'string') continue;
    const text = value.trim();
    if (text.length > 0) written[key] = text;
  }
  return Object.keys(written).length > 0 ? written : null;
}

/** Un elemento de Overpass, convertido a la fila que el corpus ya usa. */
function toPlace(element, family, name, decidedBy, resemblance) {
  const tags = element.tags ?? {};
  const position = element.type === 'node' ? element : element.center;
  const phones = taggedValues(tags, PHONE_TAGS, 4, 60);
  const websites = taggedValues(tags, WEBSITE_TAGS, 4, 2000);
  const dataLevel =
    phones.length + websites.length > 0
      ? 'CONTACTO_Y_DIRECCION_PUBLICADOS'
      : 'NOMBRE_ACTIVIDAD_Y_COORDENADAS';
  return {
    placeId: `osm:${element.type}:${element.id}`,
    publisherRecordId: String(element.id),
    publisher: 'OpenStreetMap contributors',
    name,
    locality: tags['addr:city']?.trim() || null,
    department: statedDepartment(tags),
    address: addressFromTags(tags),
    latitude: position.lat,
    longitude: position.lon,
    entityGroup: null, // lo completa classifyTransportElements con el catalogo
    entityFamily: family,
    commercialRole: null,
    isRegulated: null,
    officialValidationSource: null,
    validationPriority: null,
    genericFamily: false,
    classificationMethod:
      decidedBy === 'anexo_A_201'
        ? 'puente_explicito_tags_osm_a_codigos_existentes'
        : /*
           * Cubre tanto el catalogo de 2.330 como las tres familias que este
           * encargo anadio (`mt_transporte_2026-09-23`): el esquema no tiene
           * un tercer valor para «puente hacia una familia que esta misma
           * lectura hizo existir», y decir que el puente va hacia el
           * catalogo de 2.330 es la aproximacion mas cercana entre las dos
           * que hay — quien necesite saber cual de las dos decidio la
           * familia lo lee en `decided_by`, dentro del catalogo unido.
           */
          'puente_explicito_tags_osm_a_catalogo_2330',
    categoryKey: categoryKeyOf(tags),
    taxonomyHierarchy: [],
    basicCategory: null,
    confidence: null,
    positionMethod:
      element.type === 'node' ? 'nodo_osm_original' : 'centro_bbox_objeto_osm_no_es_entrada',
    dataLevel,
    phones,
    emails: [],
    websites,
    socials: [],
    warnings: [],
    sourceDatasetUrl: null,
    sourceRecordUrl: `https://www.openstreetmap.org/${element.type}/${element.id}`,
    snapshotTakenAt: element.timestamp ?? null,
    sourceTags: writtenTags(tags),
    openingHours: tags.opening_hours?.trim() || null,
    resemblesHeldPlace: resemblance,
    licence: 'ODbL-1.0',
    observationId: `osm:${element.type}:${element.id}`,
  };
}

/**
 * Lee todos los archivos de descarga que se le pasan y devuelve sus
 * elementos, deduplicados por identificador de OpenStreetMap.
 *
 * Un mismo nodo puede volver en mas de una consulta —una plataforma de bus
 * casa con dos filtros distintos—, y quedarse con la primera copia es
 * correcto porque las dos son el mismo objeto tal como Overpass lo devolvio
 * en el mismo dia.
 */
export async function readTransportOsmFiles(paths) {
  const byId = new Map();
  let read = 0;
  for (const path of paths) {
    const text = await readFile(path, 'utf8');
    const parsed = JSON.parse(text);
    for (const element of parsed.elements ?? []) {
      read += 1;
      const position = element.type === 'node' ? element : element.center;
      if (!position) continue;
      const key = `osm:${element.type}:${element.id}`;
      if (!byId.has(key)) byId.set(key, element);
    }
  }
  return { elements: [...byId.values()], read };
}

/**
 * Clasifica y filtra los elementos leidos, dejando fuera lo que el catalogo
 * no define, lo que ya esta guardado y lo que no tiene nombre publicable.
 *
 * `catalogueDecisions` es un mapa codigo -> `decided_by`, leido del catalogo
 * unido tal cual esta en disco, porque `readFamilyCatalogue` no conserva ese
 * campo — no lo necesita para nada mas que esto.
 */
export function classifyTransportElements(
  elements,
  catalogue,
  catalogueDecisions,
  heldPlaceIds,
  heldGrid,
) {
  const rejected = {
    offPlanet: 0,
    outsideCountry: 0,
    paisVecinoPorEtiqueta: 0,
    alreadyHeld: 0,
    sinNombrePublicable: 0,
    sinFamiliaReconocida: 0,
  };
  const missingFamilies = new Map();
  const places = [];
  let resembling = 0;

  for (const element of elements) {
    const placeId = `osm:${element.type}:${element.id}`;
    if (heldPlaceIds.has(placeId)) {
      rejected.alreadyHeld += 1;
      continue;
    }
    const position = element.type === 'node' ? element : element.center;
    const { lat, lon } = position;
    if (!(lat >= -90 && lat <= 90 && lon >= -180 && lon <= 180)) {
      rejected.offPlanet += 1;
      continue;
    }
    if (!withinCountry(lat, lon)) {
      rejected.outsideCountry += 1;
      continue;
    }
    const tags = element.tags ?? {};
    /*
     * El rectangulo no es la frontera: cubre esquinas de Brasil, Peru,
     * Paraguay, Argentina y Chile. Cuando el propio mapeador escribio un pais
     * o un departamento que no es boliviano, se cree a la etiqueta antes que
     * al rectangulo.
     */
    if (isForeignByTags(tags)) {
      rejected.paisVecinoPorEtiqueta += 1;
      continue;
    }
    const family = classifyTransportFamily(tags);
    if (!family) {
      rejected.sinFamiliaReconocida += 1;
      continue;
    }
    const definition = catalogue.get(family);
    if (!definition) {
      const seen = missingFamilies.get(family) ?? { records: 0 };
      seen.records += 1;
      missingFamilies.set(family, seen);
      continue;
    }
    const name = nameOf(tags, family);
    if (!name) {
      rejected.sinNombrePublicable += 1;
      continue;
    }
    const resemblance = heldGrid
      ? resemblanceTo(heldGrid, { nombre: name, latitud: lat, longitud: lon })
      : null;
    if (resemblance) resembling += 1;

    const decidedBy = catalogueDecisions.get(family) ?? 'catalogo_2330';
    const place = toPlace(element, family, name, decidedBy, resemblance);
    place.entityGroup = definition.group;
    place.commercialRole = definition.commercialRole;
    place.isRegulated = definition.isRegulated;
    place.officialValidationSource = definition.officialValidationSource;
    place.validationPriority = definition.isRegulated ? 'HIGH' : 'NORMAL';
    places.push(place);
  }

  return { places, rejected, missingFamilies, resembling };
}

/** La huella de un archivo de descarga, para registrarla en la procedencia. */
export async function sha256Of(path) {
  const bytes = await readFile(path);
  return createHash('sha256').update(bytes).digest('hex');
}
