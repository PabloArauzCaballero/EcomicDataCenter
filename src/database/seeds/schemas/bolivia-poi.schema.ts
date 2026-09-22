import { z } from 'zod';

/**
 * The places of three Bolivian cities, as Overture Maps publishes them.
 *
 * Santa Cruz de la Sierra, La Paz and Cochabamba, bounded by the division
 * polygons Overture itself draws rather than by a rectangle around each city:
 * a bounding box over La Paz reaches into El Alto, and the two are not the same
 * municipality. Where a polygon could not be resolved the extractor refuses to
 * run rather than fall back to a rectangle quietly.
 *
 * A place is not a reading. Nothing here is measured, nothing is a series, and
 * nothing carries a value that changes with time — which is why the loader
 * files these as facts about a place and not as indicator readings.
 *
 * What the catalogue does not claim is as load-bearing as what it does. A
 * classification into one of 201 families is derived from the publisher's own
 * taxonomy, and a place that matches none of them stays as `OTRA_ENTIDAD` with
 * its native taxonomy intact instead of being discarded to make the families
 * look complete. `isRegulated` marks a place whose activity a Bolivian
 * regulator licenses — a pharmacy, a clinic, a bank — and it means «this must
 * be checked against its regulator», never «this has been checked».
 */

/** Constant across the corpus, so it is stated once instead of 26.671 times. */
const provenance = z.object({
  publisher: z.literal('Overture Maps Foundation'),
  /**
   * The release-pinned address the extractor read, kept on the artifact rather
   * than inside each place.
   *
   * A place is identified by its own `placeId`, not by where a download came
   * from. Folding the address into the record would make a re-extraction from
   * a different mirror hash as a different place and land the whole city a
   * second time — the failure the market collector already walked into once
   * when Binance's host changed.
   */
  sourceUrl: z.string().trim().min(12).max(400),
  release: z
    .string()
    .trim()
    .regex(/^\d{4}-\d{2}-\d{2}\.\d+$/u),
  retrievedAt: z.iso.datetime(),
  upstreamSha256: z
    .string()
    .trim()
    .regex(/^[0-9a-f]{64}$/u),
  /** Below this, the publisher's own confidence, the extractor drops a place. */
  minimumConfidence: z.number().min(0).max(1),
  geofenceMethod: z.enum(['overture_division_area', 'explicit_bbox_fallback']),
  countryCode: z.literal('BO'),
  /** Every licence the upstream records arrive under, named for the reader. */
  licenses: z.array(z.string().trim().min(2).max(60)).min(1),
});

/** Which upstream record a place came from, and in whose dataset. */
const upstream = z.object({
  dataset: z.string().trim().min(1).max(80),
  recordId: z.string().trim().min(1).max(200),
});

const place = z
  .object({
    /** Overture's own identifier: stable across releases, and the key here. */
    placeId: z.uuid(),
    name: z.string().trim().min(1).max(300),
    city: z.enum(['Santa Cruz de la Sierra', 'La Paz', 'Cochabamba']),
    department: z.string().trim().min(2).max(80),
    /**
     * The neighbourhood, when Overture publishes a polygon that contains the
     * point. Absent when it does not: the extractor does not invent one.
     */
    zone: z.string().trim().min(1).max(160).optional(),
    zoneType: z.enum(['borough', 'macrohood', 'neighborhood', 'microhood']).optional(),
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
    /** Veintidos papeles del catalogo mas `OTHER`, y uno lleva digito: `SELLER_B2B`. */
    commercialRole: z
      .string()
      .trim()
      .regex(/^[A-Z0-9_]{2,40}$/u),
    /** Licensed by a Bolivian regulator: to be verified, not verified. */
    isRegulated: z.boolean(),
    type: z.string().trim().min(1).max(120).optional(),
    basicCategory: z.string().trim().min(1).max(120).optional(),
    /** The publisher's taxonomy as published, not translated into ours. */
    taxonomyHierarchy: z.array(z.string().trim().min(1).max(120)).optional(),
    confidence: z.number().min(0).max(1).optional(),
    qualityGrade: z.enum(['A', 'B', 'C', 'D']).optional(),
    address: z.string().trim().min(1).max(300).optional(),
    /*
     * No hay codigo postal. Overture publica uno y en estas tres ciudades
     * contiene coordenadas —«-16.491557,-68.201283»— y nombres de ciudad,
     * asi que llamarlo codigo postal seria decir del dato algo que el dato
     * no sostiene. Se retira al construir la semilla, no aqui.
     */
    phones: z.array(z.string().trim().min(4).max(40)).optional(),
    emails: z.array(z.string().trim().min(5).max(200)).optional(),
    /*
     * Mil, y no quinientos, porque la direccion mas larga del corpus mide
     * 776: es un redirector de Facebook que envuelve la direccion real.
     * Recortarla dejaria una direccion que no resuelve, y una direccion que
     * no resuelve no es evidencia de nada.
     */
    websites: z.array(z.string().trim().min(4).max(1000)).optional(),
    socials: z.array(z.string().trim().min(4).max(500)).optional(),
    /** Which Bolivian register would confirm a regulated place, if any. */
    officialValidationSource: z.string().trim().min(2).max(200).optional(),
    /**
     * `HIGH` for a regulated place, `NORMAL` for the rest. Derived from
     * `isRegulated` and never measured, so it adds no information the row does
     * not already carry — it is kept because it is the queue the extractor
     * publishes, and dropping it would leave the two out of step.
     */
    validationPriority: z.enum(['HIGH', 'NORMAL']).optional(),
    /**
     * Name and rounded position, which is how two records of one shop are
     * suspected of being the same shop. A suspicion, deliberately: merging on
     * it here would delete a real second branch on the same block.
     */
    duplicateCandidateKey: z.string().trim().min(3).max(300).optional(),
    upstream: z.array(upstream).optional(),
    brand: z.string().trim().min(1).max(200).optional(),
  })
  .strict();

export const boliviaPoiSchema = z
  .object({
    dataset: z.literal('bolivia-3cities-poi-v2'),
    provenance,
    places: z.array(place).min(1),
  })
  .strict();

export type BoliviaPoi = z.infer<typeof boliviaPoiSchema>;
export type PoiPlace = z.infer<typeof place>;
export type PoiProvenance = z.infer<typeof provenance>;
