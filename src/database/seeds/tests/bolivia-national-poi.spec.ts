import { boliviaNationalPoiSchema } from '../schemas/bolivia-national-poi.schema';

/**
 * The national place corpus, held to what the delivery actually contains.
 *
 * Every case here is a shape that was measured in the delivery of 2026-09-11
 * and not one that was imagined: the three identifier forms it mints, the half
 * of the corpus that carries no confidence and no town, the longest website in
 * it, and the empty strings that arrive where a telephone should be.
 */

const provenance = {
  publishers: ['Overture Maps Foundation', 'OpenStreetMap contributors'],
  release: '2026-08-19.0',
  extractionDate: '2026-09-11',
  deliverySha256: 'a'.repeat(64),
  deliveryReportSha256: 'b'.repeat(64),
  deliveryUri: 'urn:observatorio:entrega:bolivia-nacional:2026-09-11',
  upstreamDatasets: ['https://download.geofabrik.de/south-america/bolivia-260909-free.shp.zip'],
  licences: ['CDLA-Permissive-2.0', 'ODbL-1.0'],
  geofenceMethod: 'country_polygon',
  countryCode: 'BO',
  catalogueFamilies: 201,
};

/** An OpenStreetMap place: no town, no address, no confidence, no contact. */
const cartographicPlace = {
  placeId: 'osm:node:270749762',
  publisherRecordId: 'osm:node:270749762',
  publisher: 'OpenStreetMap contributors',
  name: 'Carrera de Geografia',
  locality: null,
  address: null,
  latitude: -16.5070588,
  longitude: -68.1284339,
  entityGroup: 'EDUCACION',
  entityFamily: 'UNIVERSIDAD',
  commercialRole: 'EDUCATION',
  isRegulated: true,
  officialValidationSource: 'Ministerio de Educación',
  validationPriority: 'HIGH',
  genericFamily: true,
  classificationMethod: 'puente_semantico_osm_catalogo_v3',
  categoryKey: 'university',
  taxonomyHierarchy: [],
  basicCategory: 'university',
  confidence: null,
  positionMethod: 'original_osm_node',
  dataLevel: 'B_REGISTRO_CARTOGRAFICO',
  phones: [],
  emails: [],
  websites: [],
  socials: [],
  warnings: ['familia_generica_no_refinada'],
  sourceDatasetUrl: 'https://download.geofabrik.de/south-america/bolivia-260909-free.shp.zip',
  licence: 'ODbL-1.0',
  observationId: 'bo20260911:05:45743',
};

function seedWith(...places: ReadonlyArray<Record<string, unknown>>): unknown {
  return { dataset: 'bolivia-national-poi-v3', provenance, places };
}

function placeWith(changes: Record<string, unknown>): Record<string, unknown> {
  return { ...cartographicPlace, ...changes };
}

describe('bolivia national place seed', () => {
  it('accepts a place that carries no town, no confidence and no contact', () => {
    const seed = boliviaNationalPoiSchema.parse(seedWith(cartographicPlace));
    expect(seed.places[0]?.confidence).toBeNull();
    expect(seed.places[0]?.locality).toBeNull();
  });

  it('accepts the three identifier forms the delivery mints', () => {
    const identifiers = [
      'overture:8d90062c-c1d6-4ee5-be43-4d48d909184f',
      'osm:node:270749762',
      'geofabrik:pois_areas:28436195',
    ];
    for (const placeId of identifiers) {
      expect(() => boliviaNationalPoiSchema.parse(seedWith(placeWith({ placeId })))).not.toThrow();
    }
  });

  it('refuses an identifier that names no publisher', () => {
    expect(() =>
      boliviaNationalPoiSchema.parse(seedWith(placeWith({ placeId: '28436195' }))),
    ).toThrow();
  });

  /*
   * Quince telefonos y una web llegan como cadena vacia. El generador las
   * descarta, y el esquema es el que impide que vuelvan a colarse: un telefono
   * vacio contado como telefono infla cuantos lugares se pueden contactar.
   */
  it('refuses a blank telephone where a telephone should be', () => {
    expect(() => boliviaNationalPoiSchema.parse(seedWith(placeWith({ phones: [''] })))).toThrow();
  });

  it('accepts the longest website in the corpus', () => {
    const website = `https://l.facebook.com/l.php?u=${'a'.repeat(1690)}`;
    expect(website.length).toBeGreaterThan(1700);
    expect(() =>
      boliviaNationalPoiSchema.parse(seedWith(placeWith({ websites: [website] }))),
    ).not.toThrow();
  });

  it('keeps a centroid distinguishable from a point a mapper placed', () => {
    const area = placeWith({
      placeId: 'geofabrik:pois_areas:28436195',
      positionMethod: 'centroid_main_ring_inside_area',
      warnings: [
        'osm_way_relation_no_distinguido_por_fuente',
        'posicion_representativa_no_entrada_verificada',
      ],
    });
    const seed = boliviaNationalPoiSchema.parse(seedWith(area));
    expect(seed.places[0]?.positionMethod).toBe('centroid_main_ring_inside_area');
  });

  it('refuses a field the corpus does not define', () => {
    expect(() =>
      boliviaNationalPoiSchema.parse(seedWith(placeWith({ department: 'Santa Cruz' }))),
    ).toThrow();
  });

  it('refuses a coordinate outside the country', () => {
    expect(() =>
      boliviaNationalPoiSchema.parse(seedWith(placeWith({ latitude: -34.6 }))),
    ).toThrow();
  });
});
