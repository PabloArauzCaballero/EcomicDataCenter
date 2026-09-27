import { z } from 'zod';

/**
 * The rail and river networks, read the way the road network is read.
 *
 * `bolivia-rail-network-osm` and `bolivia-waterways-osm` are geometry from the
 * same Geofabrik extract and the same department borders as
 * `bolivia-road-network-osm`, so the three layers overlay without drifting.
 * `bolivia-rail-flow-ine` is the count: the INE's monthly table of passengers
 * and tonnes carried by the Red Andina and the Red Oriental since 1999, which
 * the INE credits to the two railway companies.
 *
 * Navigability is the one thing OpenStreetMap does not say — 241 of 11,433
 * river ways carry `boat=yes` — so a river's category names where the claim
 * comes from: the Ministry of Public Works' waterways (`HIDROVIA`) and the
 * tributaries it studies as navigable (`NAVEGABLE_EN_ESTUDIO`), OpenStreetMap's
 * own tag (`NAVEGABLE_OSM`), or neither (`RIO`). See
 * `scripts/transport/read_osm_waterways.py`.
 */

const DEPARTMENTS = [
  'BENI',
  'CHUQUISACA',
  'COCHABAMBA',
  'LA_PAZ',
  'ORURO',
  'PANDO',
  'POTOSI',
  'SANTA_CRUZ',
  'TARIJA',
] as const;

const sha256 = z.string().regex(/^[a-f0-9]{64}$/u);
const geometry = z.array(z.array(z.tuple([z.number(), z.number()])).min(2)).min(1);
const shortId = z.string().regex(/^[a-f0-9]{16}$/u);
const label = z.string().trim().min(1).max(200).nullable();

const osmProvenance = z.object({
  publisher: z.literal('OpenStreetMap contributors'),
  licence: z.literal('ODbL-1.0'),
  attribution: z.string().trim().min(5).max(80),
  extractUri: z.url(),
  extractSha256: sha256,
  extractMd5: z.string().regex(/^[a-f0-9]{32}$/u),
  snapshotDate: z.iso.date(),
  retrievedAt: z.iso.datetime({ offset: false }),
  boundaries: z.string().trim().min(10).max(200),
  boundariesSha256: sha256,
  wayCount: z.number().int().positive(),
});

const point = {
  department: z.enum(DEPARTMENTS),
  lon: z.number().min(-70).max(-57),
  lat: z.number().min(-23.5).max(-9.5),
};

export const RAIL_NETWORKS = ['ANDINA', 'ORIENTAL', 'METROPOLITANA'] as const;

export const railNetworkSeedSchema = z
  .object({
    dataset: z.literal('bolivia-rail-network-osm'),
    provenance: osmProvenance.strict(),
    lines: z
      .array(
        z
          .object({
            lineId: shortId,
            network: z.enum(RAIL_NETWORKS),
            line: label,
            department: z.enum(DEPARTMENTS),
            status: z.enum(['EN_SERVICIO', 'EN_CONSTRUCCION', 'EN_DESUSO', 'ABANDONADA']),
            operator: label,
            gauge: z.string().trim().min(1).max(20).nullable(),
            usage: z.string().trim().min(1).max(40).nullable(),
            lengthKm: z.number().nonnegative().max(3_000),
            wayCount: z.number().int().positive(),
            geometry,
          })
          .strict(),
      )
      .min(1),
    stations: z.array(
      z
        .object({
          osmId: z.string().regex(/^[nw]\d+$/u),
          name: z.string().trim().min(1).max(200),
          kind: z.enum(['ESTACION', 'APEADERO']),
          network: z.enum(RAIL_NETWORKS),
          ...point,
        })
        .strict(),
    ),
  })
  .strict();

export type BoliviaRailNetwork = z.infer<typeof railNetworkSeedSchema>;
export type RailLine = BoliviaRailNetwork['lines'][number];
export type RailStation = BoliviaRailNetwork['stations'][number];

export const railFlowsSeedSchema = z
  .object({
    dataset: z.literal('bolivia-rail-flow-ine'),
    provenance: z
      .object({
        publisher: z.literal('Instituto Nacional de Estadistica'),
        originator: z.string().trim().min(5).max(200),
        pageUrl: z.url(),
        retrievedAt: z.iso.datetime({ offset: false }),
      })
      .strict(),
    points: z
      .array(
        z
          .object({
            network: z.enum(['ANDINA', 'ORIENTAL']),
            service: z.enum(['PASAJEROS', 'CARGA', 'EQUIPAJE_ENCOMIENDA']),
            unit: z.enum(['PERSONAS', 'TONELADAS']),
            /** `AAAA` for the year's row, `AAAA-MM` for a month. */
            period: z.string().regex(/^(19|20)\d{2}(-(0[1-9]|1[0-2]))?$/u),
            value: z.number().nonnegative().max(100_000_000),
            preliminary: z.boolean(),
            /** The current year's row sums only the months published so far. */
            partialYear: z.boolean(),
            sourceUrl: z.url(),
            upstreamSha256: sha256,
            retrievedAt: z.iso.datetime({ offset: false }),
            excerpt: z.string().trim().min(5).max(200),
          })
          .strict(),
      )
      .min(1),
  })
  .strict();

export type BoliviaRailFlows = z.infer<typeof railFlowsSeedSchema>;
export type RailFlowPoint = BoliviaRailFlows['points'][number];

export const WATERWAY_CATEGORIES = [
  'HIDROVIA',
  'NAVEGABLE_EN_ESTUDIO',
  'NAVEGABLE_OSM',
  'RIO',
  'TRANSBORDADOR',
] as const;

export const waterwaysSeedSchema = z
  .object({
    dataset: z.literal('bolivia-waterways-osm'),
    provenance: osmProvenance
      .extend({
        navigabilitySource: z.url(),
        navigabilityPublisher: z.string().trim().min(5).max(200),
      })
      .strict(),
    waterways: z
      .array(
        z
          .object({
            waterwayId: shortId,
            category: z.enum(WATERWAY_CATEGORIES),
            name: label,
            department: z.enum(DEPARTMENTS),
            lengthKm: z.number().nonnegative().max(30_000),
            /** Kilometres OpenStreetMap itself tags `boat=yes`. */
            boatYesKm: z.number().nonnegative().max(30_000),
            wayCount: z.number().int().positive(),
            geometry,
          })
          .strict(),
      )
      .min(1),
    ports: z.array(
      z
        .object({
          osmId: z.string().regex(/^[nw]\d+$/u),
          name: label,
          kind: z.enum(['PUERTO', 'TERMINAL']),
          ...point,
        })
        .strict(),
    ),
  })
  .strict();

export type BoliviaWaterways = z.infer<typeof waterwaysSeedSchema>;
export type Waterway = BoliviaWaterways['waterways'][number];
export type WaterPort = BoliviaWaterways['ports'][number];
