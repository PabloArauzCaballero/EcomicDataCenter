/**
 * Clasifica un lugar de transporte a partir de las etiquetas de OpenStreetMap.
 *
 * Separado de `read-transport-osm.mjs` porque es la unica parte de esa
 * lectura que no tiene que ver con leer archivos ni con armar filas: es la
 * regla que dice, para cada nodo, via o relacion, cual de las familias del
 * catalogo unido describe lo que el mapeador etiqueto.
 */

/*
 * El mismo rectangulo que acepta `bolivia-national-poi.schema.ts`. Overpass
 * se pidio por rectangulo y no por area administrativa —ver la cabecera de
 * `download-transport-osm.mjs`—, asi que un nodo del Peru o del Brasil que
 * cayera dentro del rectangulo se filtra aqui, con el mismo criterio que ya
 * usa el resto del corpus para aceptar una coordenada.
 */
export function withinCountry(lat, lon) {
  return lat >= -23 && lat <= -9 && lon >= -70 && lon <= -57;
}

/*
 * Los nueve departamentos, escritos como OpenStreetMap los escribe en
 * `addr:state`/`is_in:state` quien sí lo llena. La lista existe porque el
 * rectangulo no es la frontera: Rio Branco (Acre, Brasil) y Puerto Maldonado
 * (Madre de Dios, Peru) caen dentro del rectangulo de Bolivia y solo la
 * propia etiqueta del mapeador — «addr:state»: «AC», «Madre de Dios» — dice
 * que el lugar no es boliviano.
 */
const BOLIVIAN_DEPARTMENTS = new Set([
  'la paz',
  'santa cruz',
  'cochabamba',
  'oruro',
  'potosi',
  'potosí',
  'chuquisaca',
  'tarija',
  'beni',
  'pando',
]);

/**
 * True cuando las propias etiquetas del elemento dicen que no esta en
 * Bolivia — un pais distinto en `addr:country`, o un departamento que no es
 * boliviano en `addr:state`/`is_in:state`.
 *
 * No decide lo contrario: la ausencia de estas etiquetas no dice que el lugar
 * SI este en Bolivia, para eso ya esta el rectangulo de coordenadas.
 */
export function isForeignByTags(tags) {
  const country = (tags['addr:country'] ?? '').trim().toUpperCase();
  if (country.length > 0 && country !== 'BO') return true;
  const state = (tags['addr:state'] ?? tags['is_in:state'] ?? '').trim().toLowerCase();
  if (state.length >= 2 && !BOLIVIAN_DEPARTMENTS.has(state)) return true;
  return false;
}

const CATEGORY_KEYS = ['aeroway', 'railway', 'amenity', 'public_transport', 'highway'];

/** La pareja clave=valor de OpenStreetMap de la que salio la clasificacion. */
export function categoryKeyOf(tags) {
  const key = CATEGORY_KEYS.find((candidate) => tags[candidate]);
  if (!key) return null;
  return `${key}=${tags[key]}`.slice(0, 120);
}

/**
 * La familia que las etiquetas de OpenStreetMap describen, o null si ninguna
 * de las que el catalogo define encaja.
 *
 * El orden importa: se prueba el nombre contra zona franca y puerto seco
 * antes que las etiquetas de transporte publico, para que un recinto
 * aduanero con una parada de bus dentro no se archive como terminal.
 */
export function classifyTransportFamily(tags) {
  const aeroway = tags.aeroway;
  if (aeroway === 'aerodrome' || aeroway === 'airstrip') {
    // Las dos variantes que el catalogo ya distingue de un aerodromo
    // convencional: la etiqueta o el nombre lo dicen sin ambiguedad.
    if (tags.glider === 'yes' || /planeador/iu.test(tags.name ?? '')) return 'OV_GLIDER_PORT';
    if (/ultraliviano|ultralight/iu.test(tags.name ?? '')) return 'OV_ULTRALIGHT_AIRPORT';
    return 'AEROPUERTO';
  }
  if (aeroway === 'terminal') return 'OV_AIRPORT_TERMINAL';
  if (aeroway === 'heliport' || aeroway === 'helipad') return 'OV_HELIPORT';

  const name = (tags.name ?? '').toLowerCase();
  if (/zona franca/u.test(name) || tags.industrial === 'free_zone') return 'ZONA_FRANCA';
  if (/puerto seco|recinto aduanero/u.test(name)) return 'PUERTO_SECO';

  if (tags.railway === 'station' || tags.railway === 'halt') return 'ESTACION_TREN';
  if (tags.aerialway === 'station') return 'TELEFERICO_ESTACION';

  if (tags.amenity === 'bus_station') return 'TERMINAL_BUS';
  if (tags.highway === 'bus_stop') return 'PARADA_BUS';
  if (tags.public_transport === 'platform') {
    if (/trufi/u.test(name) || tags.share_taxi === 'yes') return 'PARADA_TRUFI';
    return 'PARADA_BUS';
  }
  if (tags.public_transport === 'station') return 'OV_PUBLIC_TRANSIT_FACILITY_OR_SERVICE';

  if (
    tags.harbour === 'yes' ||
    tags.amenity === 'ferry_terminal' ||
    tags.industrial === 'port' ||
    tags.landuse === 'port' ||
    tags['harbour:category']
  ) {
    return 'PUERTO_FLUVIAL';
  }
  if (tags.man_made === 'pier') return 'OV_PIER';

  return null;
}

/** El departamento, solo cuando el propio mapeador lo escribio en una etiqueta. */
export function statedDepartment(tags) {
  const stated = tags['addr:state'] ?? tags['addr:province'] ?? tags['is_in:state'] ?? null;
  const text = (stated ?? '').trim();
  return text.length > 1 ? text : null;
}

/** El nombre publicado, o el que se arma con el `ref` que el mapeador puso. */
export function nameOf(tags, family) {
  const stated = (tags.name ?? '').trim();
  if (stated.length > 0) return stated;
  const ref = (tags.ref ?? '').trim();
  if (ref.length === 0) return null;
  // Solo se arma para una parada: es donde OpenStreetMap numera sin nombrar.
  if (family === 'PARADA_BUS' || family === 'PARADA_TRUFI') return `Parada ${ref}`.slice(0, 300);
  return null;
}
