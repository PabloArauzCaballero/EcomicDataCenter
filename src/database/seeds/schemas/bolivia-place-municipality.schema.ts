import { z } from 'zod';

/**
 * The municipality a place falls in, for the places whose source named none.
 *
 * Half of the national corpus arrives without a locality: OpenStreetMap does not
 * publish one, and neither do the ANH's stations or Tel.bo's cash machines. The
 * report filed all of them under «Sin localidad declarada», which on 2026-09-24
 * held 8.039 places inside Santa Cruz de la Sierra alone — the city looked thin
 * because its own places were in another pile.
 *
 * This is a derivation of the observatory, not a statement of any publisher,
 * and it is filed apart for two reasons. The place rows are immutable and hashed:
 * rewriting one with a town would add a second row beside it. And a municipality
 * found by containment in a 2013 boundary layer is a weaker thing than a
 * municipality a source declared, so the view keeps both and says which is which.
 *
 * `method` is what happened to the point:
 * - `MUNICIPIO`: inside a municipal polygon.
 * - `MUNICIPIO_CERCANO`: in a hole of the layer — a lake, a salt flat — within
 *   `nearestMetres` of a municipality, and assigned to it with the distance.
 * - `SIN_POLIGONO`: in such a hole and farther than that.
 * - `FUERA_DE_BOLIVIA`: outside the country polygon. Loads cut by bounding box
 *   carried airports and stations of the five neighbours; they stay loaded, and
 *   this is how the report learns to leave them off a Bolivian map.
 */

const provenance = z
  .object({
    publisher: z.string().trim().min(3).max(120),
    originalPublisher: z.string().trim().min(3).max(200),
    layer: z.string().trim().min(3).max(200),
    layerUri: z.url(),
    layerSha256: z.string().regex(/^[a-f0-9]{64}$/u),
    countrySha256: z.string().regex(/^[a-f0-9]{64}$/u),
    licence: z.string().trim().min(2).max(40),
    geometryEditedOn: z.iso.date(),
    retrievedAt: z.iso.datetime({ offset: false }),
    nearestMetres: z.number().int().positive().max(5000),
  })
  .strict();

const assignment = z
  .object({
    placeId: z.string().trim().min(5).max(120),
    method: z.enum(['MUNICIPIO', 'MUNICIPIO_CERCANO', 'SIN_POLIGONO', 'FUERA_DE_BOLIVIA']),
    /** The INE's six-digit code: department, province, section. */
    municipalityCode: z
      .string()
      .regex(/^0[1-9]\d{4}$/u)
      .nullable(),
    municipality: z.string().trim().min(2).max(80).nullable(),
    department: z.string().trim().min(4).max(20).nullable(),
    distanceMetres: z.number().int().nonnegative().nullable(),
  })
  .strict()
  .refine(
    (row) =>
      (row.method === 'MUNICIPIO' || row.method === 'MUNICIPIO_CERCANO') ===
      (row.municipalityCode !== null && row.municipality !== null && row.department !== null),
    { message: 'Only an assigned place names a municipality, and every assigned place names one' },
  )
  .refine((row) => (row.method === 'MUNICIPIO_CERCANO') === (row.distanceMetres !== null), {
    message: 'Only a place assigned to the nearest municipality carries a distance',
  });

export const boliviaPlaceMunicipalitySchema = z
  .object({
    dataset: z.literal('bolivia-place-municipality'),
    provenance,
    assignments: z.array(assignment).min(1).max(5000),
  })
  .strict();

export type BoliviaPlaceMunicipality = z.infer<typeof boliviaPlaceMunicipalitySchema>;
export type PlaceMunicipalityAssignment = BoliviaPlaceMunicipality['assignments'][number];
