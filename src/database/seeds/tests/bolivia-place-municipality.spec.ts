import { readdirSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { boliviaPlaceMunicipalitySchema } from '../schemas/bolivia-place-municipality.schema';

/**
 * The municipality assignments, held to what `assign_place_municipality.py`
 * writes: a municipality only where the point fell in one, a distance only
 * where it fell in a hole of the layer.
 */

const provenance = {
  publisher: 'OCHA Field Information Services (HDX)',
  originalPublisher: 'Ministerio de Desarrollo Rural y Tierras, geometría GeoBolivia',
  layer: 'COD-AB Bolivia v02, adm3 (339 municipios)',
  layerUri: 'https://data.humdata.org/dataset/cod-ab-bol',
  layerSha256: 'a'.repeat(64),
  countrySha256: 'b'.repeat(64),
  licence: 'CC BY-IGO',
  geometryEditedOn: '2013-01-01',
  retrievedAt: '2026-09-24T14:52:00Z',
  nearestMetres: 500,
};

const inside = {
  placeId: 'tel_bo:cajero:0123456789abcdef01234567',
  method: 'MUNICIPIO',
  municipalityCode: '070101',
  municipality: 'Santa Cruz de la Sierra',
  department: 'Santa Cruz',
  distanceMetres: null,
};

function seedWith(...assignments: ReadonlyArray<Record<string, unknown>>): unknown {
  return { dataset: 'bolivia-place-municipality', provenance, assignments };
}

describe('bolivia place municipality seed', () => {
  it('accepts a place inside a municipality', () => {
    const seed = boliviaPlaceMunicipalitySchema.parse(seedWith(inside));
    expect(seed.assignments[0]?.municipality).toBe('Santa Cruz de la Sierra');
  });

  it('accepts a place outside the country, with no municipality', () => {
    const outside = {
      ...inside,
      method: 'FUERA_DE_BOLIVIA',
      municipalityCode: null,
      municipality: null,
      department: null,
    };
    expect(() => boliviaPlaceMunicipalitySchema.parse(seedWith(outside))).not.toThrow();
  });

  it('refuses a municipality on a place that fell in none', () => {
    expect(() =>
      boliviaPlaceMunicipalitySchema.parse(seedWith({ ...inside, method: 'SIN_POLIGONO' })),
    ).toThrow();
  });

  it('refuses a nearest-municipality assignment without its distance', () => {
    expect(() =>
      boliviaPlaceMunicipalitySchema.parse(seedWith({ ...inside, method: 'MUNICIPIO_CERCANO' })),
    ).toThrow();
  });

  it('parses every piece on disk', () => {
    const directory = join(__dirname, '..', 'boot', 'bolivia-place-municipality');
    const pieces = readdirSync(directory).filter((name) => name.endsWith('.json'));
    expect(pieces.length).toBeGreaterThan(0);
    for (const piece of pieces) {
      const raw = JSON.parse(readFileSync(join(directory, piece), 'utf8')) as unknown;
      expect(() => boliviaPlaceMunicipalitySchema.parse(raw)).not.toThrow();
    }
  });
});
