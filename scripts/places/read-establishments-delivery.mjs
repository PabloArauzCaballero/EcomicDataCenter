/**
 * Reads the recovered establishments delivery of 2026-09-21.
 *
 * A fourth delivery and the first that carries three shapes in one file, so
 * this module is three readers behind one door. What they have in common is
 * the sentence the delivery repeats about all 6.783 rows: they are the altas
 * the three earlier rounds proposed, recovered and repackaged, and not
 * establishments anybody investigated on the day it was packed.
 *
 *  - `granularidad_osm` (1.738) is cartography read from OpenStreetMap, under
 *    ODbL, with the tags each row was classified from. It resolves no
 *    municipality: what it has is the `addr:city` a mapper typed, which is the
 *    same kind of thing Overture prints in an address and is kept under the
 *    same name, `locality`.
 *  - `agemed` (5.011) is the pharmacy register of the Bolivian medicines
 *    agency, read from the eighteen departmental spreadsheets it publishes.
 *    Every row is a licensed pharmacy with a resolution number, and the
 *    regulator publishes the coordinate itself — which is not the same as
 *    anyone having stood at the door, and the row says so.
 *  - `rondas_50` (34) are branches an entity publishes in its own directory:
 *    thirty-three bank offices and one restaurant. Nobody else stands behind
 *    them, so what the row states is what the entity states about itself.
 *
 * Two rules are inherited whole from the deliveries before this one, and for
 * the same measured reasons:
 *
 *  - The register's contact details do not travel. AGEMED publishes a
 *    telephone for 4.360 of its pharmacies, 84% of them sole traders, and the
 *    spreadsheet grants no licence to redistribute anything. The corpus keeps
 *    contacts when the source is a business directory AND its licence is open;
 *    this one is the first and not the second, exactly like SEPREC. The name,
 *    the declared address, the resolution and the coordinate come in whole.
 *  - A coordinate that contradicts its own row does not enter. 199 pharmacies
 *    sit more than 25 km from the middle of the municipality they name — one
 *    of them 592 km away, a Santa Cruz address landing in another department.
 *    When the coordinate and the municipality disagree, one of the two is
 *    wrong and nothing here can say which.
 */

import { readFile } from 'node:fs/promises';
import { addressFromTags, resemblanceTo } from './read-expansion-delivery.mjs';
import { inTitleCase } from './read-registry-delivery.mjs';

const AGEMED_LICENCE = 'sin_licencia_abierta_expresa_verificada; lista publica de farmacias AGEMED';
const ENTITY_LICENCE =
  'sin_licencia_abierta_expresa_verificada; directorio publico de la propia entidad';

/** Como nombra cada entidad su propio directorio, y bajo que nombre publica. */
const ENTITY_PUBLISHERS = new Map([
  ['BCP', 'BCP'],
  ['Banco Economico', 'Banco Economico'],
  ['Pollos Copacabana', 'Pollos Copacabana'],
]);

/** Las etiquetas de OpenStreetMap que son un contacto, por lo que son. */
const PHONE_TAGS = ['phone', 'contact:phone', 'mobile', 'contact:mobile'];
const EMAIL_TAGS = ['email', 'contact:email'];
const WEBSITE_TAGS = ['website', 'contact:website', 'url'];
const SOCIAL_TAGS = [
  'contact:facebook',
  'contact:instagram',
  'contact:twitter',
  'contact:tiktok',
  'contact:youtube',
  'contact:whatsapp',
  'facebook',
  'instagram',
];

/**
 * Los valores de una etiqueta de OpenStreetMap, que puede traer varios.
 *
 * El punto y coma es como OpenStreetMap separa dos telefonos en un campo. Se
 * parten por el separador que el publicador usa y por ningun otro: partir por
 * la barra o por la coma decidiria donde acaba un numero, que es una
 * suposicion sobre el dato.
 */
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
 * Mismo procedimiento que en la entrega del registro mercantil: no hay
 * poligonos municipales aqui, y donde cae la mayoria de los que dicen estar en
 * un municipio sirve para lo unico que se le pide, ver quien esta lejisimos.
 */
function municipalCentres(records, municipalityOf) {
  const grouped = new Map();
  for (const record of records) {
    const name = municipalityOf(record);
    if (!name) continue;
    const cell = grouped.get(name);
    if (cell) cell.push(record);
    else grouped.set(name, [record]);
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

/** Un texto que el publicador escribio, o null si lo dejo en blanco. */
function stated(value, longest) {
  const text = typeof value === 'string' ? value.trim() : '';
  if (text.length === 0) return null;
  return text.slice(0, longest);
}

/**
 * Las etiquetas del publicador, con los valores que no son texto escritos.
 *
 * El directorio de una entidad publica numeros —la latitud, un contador de
 * distancia— dentro del mismo objeto que sus textos. Se guardan escritos tal
 * como vienen, porque el campo donde viven es de texto y porque quitarlos
 * seria decidir que parte de lo que publico la entidad no cuenta.
 */
function writtenTags(tags) {
  const written = {};
  for (const [key, value] of Object.entries(tags ?? {})) {
    if (value === null || value === undefined) continue;
    if (typeof value === 'object') continue;
    const text = String(value).trim();
    if (text.length > 0) written[key] = text;
  }
  return Object.keys(written).length > 0 ? written : null;
}

/**
 * Una fila de OpenStreetMap.
 *
 * La familia decide el metodo: un codigo del anexo de 201 lo puso ahi un
 * puente hacia los codigos que el corpus ya tenia, y un codigo `OV_*` lo puso
 * un puente hacia el catalogo de 2.330. Los dos metodos existen ya en el
 * esquema porque las dos cosas ya habian pasado.
 */
function toMappedPlace(record, family, resemblance, inAnnex) {
  const tags = record.raw_tags ?? {};
  const evidence = record.clasificacion_evidencia ?? {};
  const phones = taggedValues(tags, PHONE_TAGS, 4, 60);
  const emails = taggedValues(tags, EMAIL_TAGS, 5, 200);
  const websites = taggedValues(tags, WEBSITE_TAGS, 4, 2000);
  const socials = taggedValues(tags, SOCIAL_TAGS, 4, 500);
  const reachable = phones.length + emails.length + websites.length > 0;
  return {
    placeId: record.id,
    publisherRecordId: record.id.split(':').at(-1),
    publisher: 'OpenStreetMap contributors',
    name: record.nombre.trim().slice(0, 300),
    locality: stated(tags['addr:city'], 160),
    department: null,
    address: addressFromTags(tags),
    latitude: record.latitud,
    longitude: record.longitud,
    entityGroup: family.group,
    entityFamily: record.familia_codigo,
    commercialRole: family.commercialRole,
    isRegulated: family.isRegulated,
    officialValidationSource: family.officialValidationSource,
    validationPriority: family.isRegulated ? 'HIGH' : 'NORMAL',
    genericFamily: evidence.generic === true,
    classificationMethod: inAnnex
      ? 'puente_explicito_tags_osm_a_codigos_existentes'
      : 'puente_explicito_tags_osm_a_catalogo_2330',
    categoryKey: evidence.tag ? `${evidence.tag}=${evidence.value}`.slice(0, 120) : null,
    taxonomyHierarchy: [],
    basicCategory: null,
    confidence: null,
    positionMethod:
      record.metodo_posicion === 'nodo_osm'
        ? 'nodo_osm_original'
        : 'centro_bbox_objeto_osm_no_es_entrada',
    dataLevel: reachable ? 'CONTACTO_Y_DIRECCION_PUBLICADOS' : 'NOMBRE_ACTIVIDAD_Y_COORDENADAS',
    phones,
    emails,
    websites,
    socials,
    warnings: [],
    sourceDatasetUrl: null,
    sourceRecordUrl: record.source_url ?? null,
    snapshotTakenAt: record.fecha_snapshot_fuente ?? null,
    sourceTags: writtenTags(tags),
    openingHours: stated(tags.opening_hours, 400),
    resemblesHeldPlace: resemblance,
    licence: record.licencia,
    observationId: record.id,
  };
}

/** Lo que hay que avisar de una farmacia, medido y no supuesto. */
function pharmacyWarnings(record) {
  const warnings = ['registro_sanitario_no_verifica_local_abierto'];
  const decimals = Math.max(
    String(record.latitud).split('.').at(-1)?.length ?? 0,
    String(record.longitud).split('.').at(-1)?.length ?? 0,
  );
  // Doce decimales son nanometros. Nadie declara eso: la calculo una maquina.
  if (decimals >= 12) warnings.push('coordenada_calculada_precision_no_declarable');
  if (!stated(record.municipio, 160)) warnings.push('sin_municipio_declarado');
  if (!stated(record.resolucion_fuente, 80)) warnings.push('sin_numero_de_resolucion_publicado');
  return warnings;
}

/**
 * Una farmacia del registro sanitario.
 *
 * La resolucion y su fecha son lo que convierte esta fila en un registro y no
 * en un punto en un mapa: dicen que un regulador habilito ese establecimiento
 * y cuando. Van con las palabras del publicador, en `sourceTags`, que es donde
 * el corpus guarda lo que el publicador dijo de los suyos.
 */
function toPharmacyPlace(record, family, resemblance) {
  const municipality = stated(record.municipio, 160);
  return {
    placeId: record.id,
    publisherRecordId: `${record.raw_locator.url_archivo_fuente.split('/').at(-1)}:fila:${record.source_row}`,
    publisher: 'AGEMED',
    name: record.nombre.trim().slice(0, 300),
    locality: municipality ? inTitleCase(municipality) : null,
    department: inTitleCase(record.departamento),
    address: stated(record.direccion, 300),
    latitude: record.latitud,
    longitude: record.longitud,
    entityGroup: family.group,
    entityFamily: record.familia_codigo,
    commercialRole: family.commercialRole,
    isRegulated: family.isRegulated,
    officialValidationSource: family.officialValidationSource,
    validationPriority: family.isRegulated ? 'HIGH' : 'NORMAL',
    /*
     * El tipo lo escribe el regulador en su propia lista —«FARMACIA PRIVADA
     * UNIPERSONAL»— y de ahi sale la familia. No es una familia generica que
     * un catalogo posterior vaya a refinar: es la clase con la que se habilito.
     */
    genericFamily: false,
    classificationMethod: 'tipo_declarado_por_el_regulador_sanitario',
    categoryKey: stated(record.tipo_establecimiento_fuente, 120),
    taxonomyHierarchy: [],
    basicCategory: null,
    confidence: null,
    positionMethod: 'coordenada_publicada_por_el_regulador_no_entrada_verificada',
    dataLevel: 'REGISTRO_SANITARIO_DIRECCION_DECLARADA',
    // Sin contactos, a proposito. Ver la cabecera de este archivo.
    phones: [],
    emails: [],
    websites: [],
    socials: [],
    warnings: pharmacyWarnings(record),
    sourceDatasetUrl: record.source_url ?? null,
    sourceRecordUrl: null,
    snapshotTakenAt: record.capturado_utc ?? null,
    sourceTags: writtenTags({
      tipo_establecimiento: record.tipo_establecimiento_fuente,
      resolucion: record.resolucion_fuente,
      fecha_resolucion: record.fecha_resolucion_fuente,
      fila_excel: record.source_row,
      sha256_xlsx: record.sha256_xlsx,
    }),
    openingHours: null,
    resemblesHeldPlace: resemblance,
    licence: AGEMED_LICENCE,
    observationId: record.id,
  };
}

/** Una sede que una entidad publica en su propio directorio. */
function toEntityPlace(record, family, resemblance) {
  const warnings = [...(record.advertencias_fuente ?? [])];
  /*
   * «Requiere revision de identidad» lo dice la propia entrega de 34 filas, y
   * quiere decir lo que dice: que la sede es la que la entidad publica, y que
   * nadie comprobo que sea un inmueble distinto de otro ya contado.
   */
  if (record.requiere_revision_identidad) warnings.push('identidad_del_local_requiere_revision');
  if (record.sede_anfitriona_no_confirmada) warnings.push('sede_anfitriona_no_confirmada');
  if (!record.geografia_por_poligono_validada) warnings.push('geografia_no_validada_por_poligono');
  const city = stated(record.ciudad_declarada, 160);
  return {
    placeId: record.id,
    publisherRecordId: String(
      record.source_id_original ?? `${record.campo_origen}:${record.indice_origen}`,
    ),
    publisher: ENTITY_PUBLISHERS.get(record.fuente),
    name: record.nombre.trim().slice(0, 300),
    locality: city ? inTitleCase(city) : null,
    department: inTitleCase(record.departamento_declarado),
    address: stated(record.direccion_publicada, 300),
    latitude: record.latitud,
    longitude: record.longitud,
    entityGroup: family.group,
    entityFamily: record.familia_codigo,
    commercialRole: family.commercialRole,
    isRegulated: family.isRegulated,
    officialValidationSource: family.officialValidationSource,
    validationPriority: family.isRegulated ? 'HIGH' : 'NORMAL',
    genericFamily: false,
    classificationMethod: 'canal_declarado_por_la_entidad_en_su_propio_directorio',
    categoryKey: stated(record.canal_fuente, 120),
    taxonomyHierarchy: [],
    basicCategory: null,
    confidence: null,
    positionMethod: 'coordenada_publicada_por_la_entidad_no_entrada_verificada',
    dataLevel: 'CONTACTO_Y_DIRECCION_PUBLICADOS',
    /*
     * Aqui el contacto si viaja: es la centralita que la propia entidad
     * publica de su sucursal en su sitio, no el numero de un particular.
     */
    phones: (record.telefonos_publicados_normalizados ?? []).filter(
      (phone) => phone.length >= 4 && phone.length <= 60,
    ),
    emails: [],
    websites: [],
    socials: [],
    warnings,
    sourceDatasetUrl: null,
    sourceRecordUrl: record.source_url ?? null,
    snapshotTakenAt: record.capturado_utc ?? null,
    sourceTags: writtenTags(record.raw),
    openingHours: stated(record.horario_publicado, 400),
    resemblesHeldPlace: resemblance,
    licence: ENTITY_LICENCE,
    observationId: record.observacion_id ?? record.id,
  };
}

/**
 * El municipio de una fila, con su departamento delante.
 *
 * Con el nombre solo no vale: hay un San Ignacio en Beni y otro en Santa Cruz,
 * a 400 km. Juntarlos pondria el centro del municipio en medio de los dos y el
 * cotejo diria que las farmacias de ambos estan lejos de su propio pueblo.
 */
function municipalityKeyOf(record) {
  const municipality = stated(record.municipio, 160);
  return municipality ? `${stated(record.departamento, 80)}|${municipality}` : null;
}

/** En que tanda vino la fila, que es lo que decide como se lee. */
function batchOf(record) {
  return record._recuperacion?.tanda ?? 'desconocida';
}

/**
 * Reads the delivery and turns into places the rows whose position holds up.
 *
 * `heldPlaceIds` are the identifiers the observatory already stores, so a row
 * recovered from an earlier round does not land a second time. `annex` is the
 * set of family codes the 201-family catalogue defines, which is what tells a
 * mapped row which of the two classification bridges put it where it is.
 */
export async function readEstablishmentsDelivery(path, catalogue, heldPlaceIds, heldGrid, annex) {
  const parsed = JSON.parse(await readFile(path, 'utf8'));
  const records = parsed.registros ?? [];
  const rejected = {
    alreadyHeld: 0,
    offPlanet: 0,
    outsideCountry: 0,
    farFromMunicipality: 0,
    notAnAlta: 0,
  };
  const missingFamilies = new Map();
  const inCountry = [];

  for (const record of records) {
    /*
     * La entrega trae una sola decision en las tres tandas —alta propuesta— y
     * se comprueba en vez de darse por hecha: si una entrega posterior mezcla
     * enriquecimientos con altas, esto es lo unico que lo vería.
     */
    if (!String(record.decision ?? '').startsWith('ALTA')) {
      rejected.notAnAlta += 1;
      continue;
    }
    if (heldPlaceIds.has(record.id)) {
      rejected.alreadyHeld += 1;
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

  /*
   * El cotejo contra el municipio solo se le puede hacer a quien declara uno.
   * 108 farmacias no lo declaran: de esas no se puede decir que la coordenada
   * contradiga nada, y se quedan con el aviso de que falta el municipio.
   */
  const pharmacies = inCountry.filter((record) => batchOf(record) === 'agemed');
  const centres = municipalCentres(pharmacies, municipalityKeyOf);

  const places = [];
  let resembling = 0;
  for (const record of inCountry) {
    const batch = batchOf(record);
    if (batch === 'agemed') {
      const centre = centres.get(municipalityKeyOf(record));
      if (centre) {
        const away =
          metresBetween(record.latitud, record.longitud, centre.latitude, centre.longitude) / 1000;
        if (away > 25) {
          rejected.farFromMunicipality += 1;
          continue;
        }
      }
    }

    const family = catalogue.get(record.familia_codigo);
    if (!family) {
      const seen = missingFamilies.get(record.familia_codigo) ?? {
        records: 0,
        categories: new Set(),
      };
      seen.records += 1;
      seen.categories.add(
        record.clasificacion_evidencia?.value ??
          record.tipo_establecimiento_fuente ??
          record.canal_fuente,
      );
      missingFamilies.set(record.familia_codigo, seen);
      continue;
    }
    const resemblance = resemblanceTo(heldGrid, record);
    if (resemblance) resembling += 1;

    if (batch === 'granularidad_osm') {
      places.push(toMappedPlace(record, family, resemblance, annex.has(record.familia_codigo)));
    } else if (batch === 'agemed') {
      places.push(toPharmacyPlace(record, family, resemblance));
    } else {
      places.push(toEntityPlace(record, family, resemblance));
    }
  }

  const written = new Map();
  for (const place of places) written.set(place.placeId, place);

  return {
    places: [...written.values()],
    rejected,
    missingFamilies,
    resembling,
    read: records.length,
    duplicatedInDelivery: places.length - written.size,
  };
}
