import { z } from 'zod';

/**
 * The road network Bolivia signs on the ground, read from two publishers.
 *
 * `bolivia-road-network-osm` is the geometry: every motorway, trunk, primary
 * and secondary way OpenStreetMap holds inside the country, cut at each
 * department border and grouped into the tramo the report draws — a section
 * that shares route, department, surface and status. It is not the ABC's own
 * administrative tramo: the ABC's Sistema de Información Vial and
 * Transitabilidad were unreachable when this corpus was built (a WordPress
 * error on the main site, a captcha wall on the transitability tool), so what
 * is asserted here is what a route, a surface and a state look like on the
 * ground as OpenStreetMap's contributors mapped them, not the agency's own
 * segmentation.
 *
 * `bolivia-road-length-ine` is the count: the INE's annual table of road
 * length by network and by rodadura, 2000-2024, which the INE itself credits
 * to the ABC and the departmental road services. It answers a question the
 * geometry cannot — how many kilometres, officially, not how many
 * OpenStreetMap has traced — and the two are kept apart rather than merged
 * into one figure, because they measure different things under the same
 * word.
 */

const provenanceCommon = z.object({
  retrievedAt: z.iso.datetime({ offset: false }),
});

export const roadSectionsSeedSchema = z
  .object({
    dataset: z.literal('bolivia-road-network-osm'),
    provenance: provenanceCommon
      .extend({
        publisher: z.literal('OpenStreetMap contributors'),
        licence: z.literal('ODbL-1.0'),
        attribution: z.string().trim().min(5).max(80),
        extractUri: z.url(),
        extractSha256: z.string().regex(/^[a-f0-9]{64}$/u),
        extractMd5: z.string().regex(/^[a-f0-9]{32}$/u),
        snapshotDate: z.iso.date(),
        boundaries: z.string().trim().min(10).max(200),
        boundariesSha256: z.string().regex(/^[a-f0-9]{64}$/u),
        highwayClasses: z.array(z.enum(['motorway', 'trunk', 'primary', 'secondary'])).min(1),
        simplificationToleranceDeg: z.number().positive().max(0.05),
        wayCount: z.number().int().positive(),
      })
      .strict(),
    sections: z
      .array(
        z
          .object({
            sectionId: z
              .string()
              .regex(/^[a-f0-9]{16}$/u),
            /** `F-<n>` for a Red Fundamental route, `D<n>` for a departmental one, null otherwise. */
            route: z.string().trim().min(2).max(20).nullable(),
            network: z.enum(['FUNDAMENTAL', 'DEPARTAMENTAL', 'SIN_REFERENCIA']),
            name: z.string().trim().min(1).max(200).nullable(),
            department: z.enum([
              'BENI',
              'CHUQUISACA',
              'COCHABAMBA',
              'LA_PAZ',
              'ORURO',
              'PANDO',
              'POTOSI',
              'SANTA_CRUZ',
              'TARIJA',
            ]),
            highwayClass: z.enum(['motorway', 'trunk', 'primary', 'secondary']),
            surface: z.enum([
              'PAVIMENTO',
              'EMPEDRADO',
              'RIPIO',
              'TIERRA',
              'SIN_PAVIMENTAR',
              'SIN_DATO',
            ]),
            status: z.enum(['EN_SERVICIO', 'EN_CONSTRUCCION']),
            /** Along the centreline: a dual carriageway's two directions count once. */
            lengthKm: z.number().nonnegative().max(2_000),
            /** Every drawn direction summed, before the oneway correction. */
            carriagewayKm: z.number().nonnegative().max(2_000),
            maxspeed: z.string().trim().min(1).max(20).nullable(),
            wayCount: z.number().int().positive(),
            /** One or more polylines, `[longitude, latitude]`, already simplified. */
            geometry: z
              .array(z.array(z.tuple([z.number(), z.number()])).min(2))
              .min(1),
          })
          .strict(),
      )
      .min(1),
  })
  .strict();

export type BoliviaRoadSections = z.infer<typeof roadSectionsSeedSchema>;
export type RoadSection = BoliviaRoadSections['sections'][number];

export const roadLengthsSeedSchema = z
  .object({
    dataset: z.literal('bolivia-road-length-ine'),
    provenance: provenanceCommon
      .extend({
        publisher: z.literal('Instituto Nacional de Estadistica'),
        originator: z.string().trim().min(5).max(200),
        coverage: z.string().trim().min(5).max(200),
        pageUrl: z.url(),
      })
      .strict(),
    points: z
      .array(
        z
          .object({
            geography: z.enum([
              'BOLIVIA',
              'BENI',
              'CHUQUISACA',
              'COCHABAMBA',
              'LA_PAZ',
              'ORURO',
              'PANDO',
              'POTOSI',
              'SANTA_CRUZ',
              'TARIJA',
            ]),
            network: z.enum(['TOTAL', 'FUNDAMENTAL', 'DEPARTAMENTAL']),
            surface: z.enum([
              'TOTAL',
              'PAVIMENTO',
              'EMPEDRADO',
              'RIPIO',
              'TIERRA',
              'EN_CONSTRUCCION',
              'TRAZO_EN_EVALUACION',
            ]),
            period: z.string().regex(/^(19|20)\d{2}$/u),
            lengthKm: z.number().nonnegative().max(200_000),
            /** `2022(p)`, `2023(p)` y `2024(p)`: el INE los marca preliminares. */
            preliminary: z.boolean(),
            sourceUrl: z.url(),
            upstreamSha256: z.string().regex(/^[a-f0-9]{64}$/u),
            retrievedAt: z.iso.datetime({ offset: false }),
            excerpt: z.string().trim().min(5).max(200),
          })
          .strict(),
      )
      .min(1),
  })
  .strict();

export type BoliviaRoadLengths = z.infer<typeof roadLengthsSeedSchema>;
export type RoadLengthPoint = BoliviaRoadLengths['points'][number];
