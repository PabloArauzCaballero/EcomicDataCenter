import { z } from 'zod';

/**
 * The places of Bolivia, as two publishers record them.
 *
 * The three-city corpus this observatory already holds reads Santa Cruz de la
 * Sierra, La Paz and Cochabamba from Overture alone. This one reads the whole
 * country from Overture and from OpenStreetMap together, which is why almost
 * every field the older schema could state as a constant is a choice here: two
 * publishers, two licences, and identifiers that are a UUID on one side and a
 * node number on the other.
 *
 * What it deliberately does not carry is a city and a department. The delivery
 * publishes neither: its `region` column is empty for 36.991 of the 37.278
 * Overture records and holds `S`, `L` or `H` in most of the remainder, and the
 * OpenStreetMap half — 39.134 records, more than half the corpus — carries no
 * locality at all. Deriving a department from the coordinates would need the
 * division polygons, which are not in the delivery, and assigning one from a
 * bounding box would be wrong along every border. So the corpus is located by
 * its coordinates, and by the locality Overture itself printed where it printed
 * one. `locality` is named for what it is and never called a municipality.
 *
 * A place is not a reading. Nothing here is measured, nothing is a series, and
 * nothing carries a value that changes with time.
 */

/** Constant across the delivery, so it is stated once and not 51.849 times. */
const provenance = z.object({
  publishers: z.array(z.string().trim().min(2).max(80)).min(1),
  /**
   * La version de la fuente que se leyo.
   *
   * Overture numera sus entregas `2026-08-19.0` y ese numero es la version. La
   * ampliacion lee OpenStreetMap en vivo, donde no hay version publicada: lo
   * unico que la identifica es el dia del snapshot. Se admiten las dos formas
   * porque las dos son ciertas de su fuente, y ninguna se disfraza de la otra.
   */
  release: z
    .string()
    .trim()
    .regex(/^\d{4}-\d{2}-\d{2}(?:\.\d+)?$/u),
  extractionDate: z.iso.date(),
  /**
   * The hash of the nine part hashes the delivery signs itself with.
   *
   * Not the hash of any one file: the delivery arrives split, and a fingerprint
   * over the manifest is reproducible by anyone holding the same nine parts, in
   * any order and however they unpacked them.
   */
  deliverySha256: z
    .string()
    .trim()
    .regex(/^[0-9a-f]{64}$/u),
  deliveryReportSha256: z
    .string()
    .trim()
    .regex(/^[0-9a-f]{64}$/u),
  /**
   * The delivery, named as what it is.
   *
   * Three upstream addresses feed this corpus and no single one of them is
   * where it came from: it came as files. Naming one would describe half the
   * places with the other half's provenance, so the artifact is named for the
   * package and every place keeps its own dataset address.
   */
  deliveryUri: z.string().trim().min(12).max(400),
  upstreamDatasets: z.array(z.string().trim().min(12).max(400)).min(1),
  /** Every licence the upstream records arrive under, named for the reader. */
  licences: z.array(z.string().trim().min(2).max(80)).min(1),
  geofenceMethod: z.enum(['country_polygon', 'osm_administrative_area']),
  countryCode: z.literal('BO'),
  catalogueFamilies: z.number().int().positive(),
});

const place = z
  .object({
    /**
     * The publisher's identifier with the publisher in front of it.
     *
     * Three shapes, not two. Overture mints a UUID and OpenStreetMap a node
     * number, and nothing guarantees the two will not collide once the corpus
     * grows, which is what the prefix is for. The third shape is the 8.200
     * places that reach the delivery through the Geofabrik extract, where the
     * distribution does not say whether the feature was a way or a relation:
     * naming them `osm:way:` would decide that question on the publisher's
     * behalf, so they keep the distribution that could not answer it.
     */
    placeId: z
      .string()
      .trim()
      .regex(
        /^(?:overture:[0-9a-f-]{36}|osm:(?:node|way|relation):\d{1,20}|geofabrik:[a-z_]{3,40}:\d{1,20})$/u,
      ),
    /** The same identifier as the publisher mints it, without the prefix. */
    publisherRecordId: z.string().trim().min(1).max(200),
    publisher: z.enum(['Overture Maps Foundation', 'OpenStreetMap contributors']),
    name: z.string().trim().min(1).max(300),
    /**
     * The locality Overture printed, when it printed one.
     *
     * Null for every OpenStreetMap record and for the Overture records that
     * carry no address. It is not a municipality and not a department: it is
     * the town name the publisher put in the address, kept because it is the
     * only territorial word in the corpus that the publisher stands behind.
     */
    locality: z.string().trim().min(1).max(160).nullable(),
    /**
     * El departamento, cuando la entrega lo resuelve y dice como.
     *
     * Nulo en la entrega nacional, que no lo publica. La ampliacion de
     * Cochabamba y La Paz si lo trae, porque situa cada punto por pertenencia a
     * un area administrativa de OpenStreetMap — y lo dice con esas palabras:
     * `no_limite_certificado`. Es una pertenencia observada, no una frontera
     * oficial, y el campo se llena solo cuando alguien hizo esa operacion.
     */
    department: z.string().trim().min(2).max(80).nullable(),
    address: z.string().trim().min(1).max(300).nullable(),
    latitude: z.number().min(-23).max(-9),
    longitude: z.number().min(-70).max(-57),
    entityGroup: z
      .string()
      .trim()
      .regex(/^[A-Z0-9_]{2,60}$/u),
    entityFamily: z
      .string()
      .trim()
      .regex(/^[A-Z0-9_]{2,60}$/u),
    commercialRole: z
      .string()
      .trim()
      .regex(/^[A-Z0-9_]{2,40}$/u),
    /** Licensed by a Bolivian regulator: to be verified, not verified. */
    isRegulated: z.boolean(),
    officialValidationSource: z.string().trim().min(2).max(200).nullable(),
    validationPriority: z.enum(['HIGH', 'NORMAL']),
    /**
     * The family is a broad one and the delivery says so.
     *
     * Two thirds of the corpus carries the warning `familia_generica_no_refinada`
     * beside it. It does not mean the classification is wrong; it means a finer
     * family may exist for the place and none was applied. Kept because a
     * reader counting pharmacies should be able to see how much of the count
     * rests on a coarse match.
     */
    genericFamily: z.boolean(),
    classificationMethod: z.enum([
      'clave_exacta_catalogo_v3',
      'puente_semantico_osm_catalogo_v3',
      'puente_explicito_tags_osm_a_codigos_existentes',
    ]),
    /** The publisher's own category that the family was matched from. */
    categoryKey: z.string().trim().min(1).max(120),
    taxonomyHierarchy: z.array(z.string().trim().min(1).max(120)),
    basicCategory: z.string().trim().min(1).max(120).nullable(),
    /**
     * The publisher's confidence, where the publisher publishes one.
     *
     * Null for all 39.134 OpenStreetMap records, which is not a low confidence
     * and must not be read as one: OpenStreetMap publishes no such number, and
     * writing a zero there would say the corpus doubts every one of them.
     */
    confidence: z.number().min(0).max(1).nullable(),
    /**
     * How the coordinate was arrived at, where the delivery says.
     *
     * It matters more than it looks. For 8.132 places the feature upstream is a
     * polygon — a university campus, a market, a cemetery — and the coordinate
     * is a point the extractor placed inside it, not a door anyone stood at.
     * A reader who treats that centroid as an address will send someone to the
     * middle of a field. Null for the Overture half, which publishes no such
     * field; `original_osm_node` is a point the mapper themself placed.
     */
    positionMethod: z
      .enum([
        'original_osm_node',
        'centroid_main_ring_inside_area',
        'original_outer_boundary_vertex',
        'nodo_osm_original',
        'centro_bbox_objeto_osm_no_es_entrada',
      ])
      .nullable(),
    dataLevel: z.enum([
      'A_MAYOR_CONFIANZA_Y_CONTACTO_PUBLICADO',
      'B_REGISTRO_CARTOGRAFICO',
      'CONTACTO_Y_DIRECCION_PUBLICADOS',
      'NOMBRE_ACTIVIDAD_Y_COORDENADAS',
    ]),
    /*
     * Sesenta, y no cuarenta: en la ampliacion hay un telefono de 42
     * caracteres —tres numeros pegados sin separador, tal como un mapeador los
     * escribio para el diario Los Tiempos—. Partirlo exigiria decidir donde
     * corta cada numero, que es una suposicion sobre el dato; recortarlo
     * dejaria un telefono que no llama. Se guarda como el publicador lo
     * publica.
     */
    phones: z.array(z.string().trim().min(4).max(60)),
    emails: z.array(z.string().trim().min(5).max(200)),
    /**
     * Two thousand, and not the thousand the three-city corpus allowed: the
     * longest address in this corpus measures 1.729. It is a redirector that
     * wraps the real address, and a truncated address resolves to nothing,
     * which is evidence of nothing.
     */
    websites: z.array(z.string().trim().min(4).max(2000)),
    socials: z.array(z.string().trim().min(4).max(500)),
    /** What the extractor flagged about this record, kept verbatim. */
    warnings: z.array(z.string().trim().min(2).max(120)),
    /**
     * El archivo de origen, cuando el registro viene de uno.
     *
     * La entrega nacional nombra el parquet o el shapefile del que salio cada
     * fila. La ampliacion lee OpenStreetMap en vivo y no nombra archivo
     * ninguno: lo que tiene es el enlace permanente de cada objeto y la hora
     * del snapshot. Inventarle un archivo seria decir de donde salio algo que
     * no salio de ahi.
     */
    sourceDatasetUrl: z.string().trim().min(12).max(400).nullable(),
    /** El enlace permanente del objeto en el publicador, si lo publica. */
    sourceRecordUrl: z.string().trim().min(12).max(400).nullable(),
    /**
     * La hora del snapshot que se leyo.
     *
     * No es la fecha en que alguien visito el sitio, y la propia entrega lo
     * advierte en cada fila. Un snapshot de hoy sobre un local que cerro el
     * ano pasado sigue devolviendo el local.
     */
    snapshotTakenAt: z.iso.datetime().nullable(),
    /**
     * Las etiquetas del publicador tal cual, sin traducir.
     *
     * De aqui sale la familia, y sin ellas nadie puede comprobar si la
     * traduccion fue correcta. 408 claves distintas en la ampliacion.
     */
    sourceTags: z.record(z.string(), z.string()).nullable(),
    /** El horario que el publicador publica, si publica alguno. */
    openingHours: z.string().trim().min(2).max(400).nullable(),
    /**
     * El lugar ya guardado al que este se parece tanto que probablemente sean
     * el mismo, con la distancia a la que esta.
     *
     * Una sospecha, y a proposito. Fundirlos aqui borraria una segunda sucursal
     * real en la misma manzana, que es justo lo que el corpus de tres ciudades
     * decidio no hacer. El lector que cuenta farmacias puede descontarlos; el
     * que busca una sucursal, no los pierde.
     */
    resemblesHeldPlace: z
      .object({
        placeId: z.string().trim().min(1).max(200),
        name: z.string().trim().min(1).max(300),
        metres: z.number().min(0).max(1000),
      })
      .nullable(),
    licence: z.string().trim().min(2).max(120),
    /** The row this place occupied in the delivery, for tracing it back. */
    observationId: z.string().trim().min(3).max(80),
  })
  .strict();

export const boliviaNationalPoiSchema = z
  .object({
    dataset: z.literal('bolivia-national-poi-v3'),
    provenance,
    places: z.array(place).min(1),
  })
  .strict();

export type BoliviaNationalPoi = z.infer<typeof boliviaNationalPoiSchema>;
export type NationalPoiPlace = z.infer<typeof place>;
