/**
 * Un objeto de OpenStreetMap convertido en fila de la siembra nacional, y el
 * cotejo por nombre y distancia con lo que el corpus ya tiene.
 */

import { addressFromTags } from './read-expansion-delivery.mjs';
import { AREA_ONLY, plain } from './osm-expansion-classify.mjs';

/** Las etiquetas de OpenStreetMap que son un contacto, como en la quinta entrega. */
const PHONE_TAGS = ['phone', 'contact:phone', 'mobile', 'contact:mobile'];
const EMAIL_TAGS = ['email', 'contact:email'];
const WEBSITE_TAGS = ['website', 'contact:website', 'url'];
const SOCIAL_TAGS = ['contact:facebook', 'contact:instagram', 'facebook', 'instagram'];

function taggedValues(tags, keys, shortest, longest) {
  const values = [];
  for (const key of keys) {
    const text = tags[key];
    if (typeof text !== 'string') continue;
    for (const piece of text.split(';')) {
      const value = piece.trim();
      if (value.length >= shortest && value.length <= longest && !values.includes(value)) {
        values.push(value);
      }
    }
  }
  return values;
}

export function stated(value, longest) {
  const text = typeof value === 'string' ? value.trim() : '';
  return text.length > 0 ? text.slice(0, longest) : null;
}

/** Las etiquetas tal cual, recortadas a lo que la columna admite. */
function writtenTags(tags) {
  const written = {};
  for (const [key, value] of Object.entries(tags ?? {})) {
    const text = String(value).trim();
    if (text.length > 0) written[key] = text;
  }
  return Object.keys(written).length > 0 ? written : null;
}

/** Un objeto de OpenStreetMap, con la forma que ya usa la siembra nacional. */
export function toOsmPlace(element, context) {
  const { tags } = element;
  const { family, classification, department, snapshot, resemblance, method } = context;
  const latitude = element.type === 'node' ? element.lat : element.center.lat;
  const longitude = element.type === 'node' ? element.lon : element.center.lon;
  const phones = taggedValues(tags, PHONE_TAGS, 4, 60);
  const emails = taggedValues(tags, EMAIL_TAGS, 5, 200);
  const websites = taggedValues(tags, WEBSITE_TAGS, 4, 2000);
  const socials = taggedValues(tags, SOCIAL_TAGS, 4, 500);
  const reachable = phones.length + emails.length + websites.length > 0;
  const [areaKey] = classification.key.split('=');
  const warnings = [];
  if (AREA_ONLY.has(areaKey)) warnings.push('area_de_uso_de_suelo_no_es_un_local');
  if (tags.disused === 'yes' || tags.abandoned === 'yes' || areaKey === 'historic') {
    warnings.push('puede_no_estar_en_actividad');
  }
  return {
    placeId: `osm:${element.type}:${element.id}`,
    publisherRecordId: String(element.id),
    publisher: 'OpenStreetMap contributors',
    name: tags.name.trim().slice(0, 300),
    locality: stated(tags['addr:city'], 160),
    department,
    address: addressFromTags(tags),
    latitude,
    longitude,
    entityGroup: family.group,
    entityFamily: classification.family,
    commercialRole: family.commercialRole,
    isRegulated: family.isRegulated,
    officialValidationSource: family.officialValidationSource,
    validationPriority: family.isRegulated ? 'HIGH' : 'NORMAL',
    genericFamily: false,
    classificationMethod: method,
    categoryKey: classification.key.slice(0, 120),
    taxonomyHierarchy: [],
    basicCategory: null,
    confidence: null,
    positionMethod:
      element.type === 'node' ? 'nodo_osm_original' : 'centro_bbox_objeto_osm_no_es_entrada',
    dataLevel: reachable ? 'CONTACTO_Y_DIRECCION_PUBLICADOS' : 'NOMBRE_ACTIVIDAD_Y_COORDENADAS',
    phones,
    emails,
    websites,
    socials,
    warnings,
    sourceDatasetUrl: null,
    sourceRecordUrl: `https://www.openstreetmap.org/${element.type}/${element.id}`,
    snapshotTakenAt: snapshot,
    sourceTags: writtenTags(tags),
    openingHours: stated(tags.opening_hours, 400),
    resemblesHeldPlace: resemblance,
    licence: 'ODbL-1.0',
    observationId: `osm:${element.type}:${element.id}`,
  };
}

const STOP = new Set(['de', 'la', 'el', 'los', 'las', 'del', 'y', 'en', 'sa', 'srl', 'ltda']);

/** Las palabras de un nombre que valen para compararlo, como en la ampliacion. */
function significantWords(name) {
  const words = plain(name)
    .replace(/[^a-z0-9 ]/gu, ' ')
    .split(/\s+/u)
    .filter((word) => word.length > 2 && !STOP.has(word));
  return new Set(words);
}

function metresBetween(oneLat, oneLon, otherLat, otherLon) {
  const north = (otherLat - oneLat) * 111320;
  const east = (otherLon - oneLon) * 111320 * Math.cos((oneLat * Math.PI) / 180);
  return Math.hypot(north, east);
}

/*
 * Una milesima de grado son unos 111 metros, asi que las nueve celdas
 * alrededor de un punto contienen todo lo que esta a menos de cien. La rejilla
 * de la ampliacion es de media milesima porque alli se buscaba a cuarenta.
 */
const CELLS_PER_DEGREE = 1000;
const LIMIT_METRES = 100;

/** Lo que el corpus ya tiene, en una rejilla, con las palabras ya calculadas. */
export function indexHeld(places) {
  const grid = new Map();
  for (const place of places) {
    const key = `${Math.round(place.latitude * CELLS_PER_DEGREE)}:${Math.round(place.longitude * CELLS_PER_DEGREE)}`;
    const entry = { ...place, words: significantWords(place.name) };
    const cell = grid.get(key);
    if (cell) cell.push(entry);
    else grid.set(key, [entry]);
  }
  return grid;
}

/**
 * El lugar ya guardado que este probablemente es, o null.
 *
 * Mismas dos condiciones que la ampliacion —cerca y con al menos la mitad de
 * las palabras en comun—, a cien metros en vez de cuarenta, y con una marca
 * mas: `same` cuando las palabras coinciden todas. Eso es lo que se descarta;
 * lo demas se marca y entra.
 */
export function nearestNamesake(grid, name, latitude, longitude) {
  const words = significantWords(name);
  if (words.size === 0) return null;
  const cellLat = Math.round(latitude * CELLS_PER_DEGREE);
  const cellLon = Math.round(longitude * CELLS_PER_DEGREE);
  let best = null;
  for (let down = -1; down <= 1; down += 1) {
    for (let across = -1; across <= 1; across += 1) {
      for (const held of grid.get(`${cellLat + down}:${cellLon + across}`) ?? []) {
        const metres = metresBetween(latitude, longitude, held.latitude, held.longitude);
        if (metres > LIMIT_METRES) continue;
        let shared = 0;
        for (const word of words) if (held.words.has(word)) shared += 1;
        const overlap = shared / (words.size + held.words.size - shared);
        if (overlap >= 0.5 && (best === null || overlap > best.overlap)) {
          best = { overlap, held, metres };
        }
      }
    }
  }
  if (!best) return null;
  return {
    same: best.overlap === 1,
    resemblance: {
      placeId: best.held.placeId,
      name: best.held.name.slice(0, 300),
      metres: Math.round(best.metres * 10) / 10,
    },
  };
}
