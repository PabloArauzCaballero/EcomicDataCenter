/**
 * Reads an OpenStreetMap health extract and classifies it into the corpus.
 *
 * Every earlier reader in this directory parses a delivery someone else
 * already classified. This one is different on purpose: nobody shipped
 * Bolivia's hospitals, pharmacies and clinics pre-classified for this
 * microtask, so this module looks at the OpenStreetMap tags (`amenity`,
 * `healthcare`, `operator`, `name`) and decides which family of
 * `bolivia-place-families.json` a row belongs to.
 *
 * The extract is not a live Overpass answer, though the task asked for one.
 * Every reachable mirror refused the connection or timed out —
 * `overpass-api.de`, `overpass.kumi.systems`, `lz4.overpass-api.de`,
 * `z.overpass-api.de`, `overpass.private.coffee`, `overpass.osm.jp` — and the
 * one that answered, `maps.mail.ru`, returned a server timeout on this query.
 * `download.geofabrik.de` republishes the same OpenStreetMap database as a
 * signed extract, and that is what `extract_health_osm.py` reads instead:
 * same upstream, same licence, and — unlike a live answer — a file and a
 * SHA-256 to name in `sourceDatasetUrl`.
 *
 * Three rules a reader of someone's own contact details needs that a reader
 * of an already-classified delivery does not: a `doctors`/`dentist` node
 * named for a bare person (`Dr. Juan Perez`, nothing that names a practice)
 * is not loaded at all, because OpenStreetMap's tag does not distinguish a
 * home office from a department; one that does clear that bar still drops
 * its phone/e-mail/social tags, for the same reason SEPREC's sole traders do
 * — a single-professional contact tag reads as a personal line more often
 * than a switchboard; and an operator naming a corto-plazo insurer (Caja
 * Nacional de Salud, Caja Petrolera…) is filed under `CAJA_DE_SALUD` before
 * anything else is asked, including whether it also carries
 * `amenity=hospital`, so the insurer's own network stays visible as its own
 * family instead of vanishing into `HOSPITAL`. A plain `clinic` with no
 * ownership signal defaults to `CLINICA_PRIVADA`, the weakest reachable
 * `clinic`-shaped family, and says so in `warnings`.
 */

import { addressFromTags, resemblanceTo } from './read-expansion-delivery.mjs';

/** Bolivia's bounding box, the same one every other place reader uses. */
function withinCountry(latitude, longitude) {
  return latitude >= -23 && latitude <= -9 && longitude >= -70 && longitude <= -57;
}

const PHONE_TAGS = ['phone', 'contact:phone', 'mobile', 'contact:mobile'];
const EMAIL_TAGS = ['email', 'contact:email'];
const WEBSITE_TAGS = ['website', 'contact:website', 'url'];
const SOCIAL_TAGS = [
  'contact:facebook',
  'contact:instagram',
  'contact:twitter',
  'contact:whatsapp',
  'facebook',
  'instagram',
];

/**
 * A single professional's own name, and nothing that names a practice.
 *
 * `Dr. Juan Perez Mamani` matches; `Dr. Juan Perez - Clinica San Martin` and
 * `Consultorio Dr. Perez` do not, because the second word in each names a
 * place and not a person.
 */
const BARE_PERSON_NAME =
  /^(dr\.?|dra\.?|doctor|doctora|lic\.?|od\.?)\s+[a-zñáéíóú]+(\s+[a-zñáéíóú]+){1,3}$/iu;
const NAMES_A_PRACTICE =
  /consultori|cl[íi]nic|policonsult|centro|hospital|posta|puesto de salud|caja|laborator|farmacia|odontolog|dental|salud\b/iu;

const CAJA_DE_SALUD = /caja\s+(nacional|petrolera|bancaria)\s+de\s+salud|\bcns\b|\bcps\b/iu;
const NAMES_POSTA = /\bposta\s+sanitaria\b|\bposta\s+de\s+salud\b/iu;
const NAMES_PUESTO = /\bpuesto\s+de\s+salud\b/iu;
const NAMES_POLICONSULTORIO = /policonsultori/iu;
const PUBLIC_OPERATOR =
  /ministerio|\bsedes\b|municipal|gobierno\s+aut[oó]nomo|alcald[íi]a|\bsnis\b/iu;
const NAMES_CENTRO_SALUD = /\bcentro\s+de\s+salud\b/iu;

/** A tag's values, OpenStreetMap's own separator and no other. */
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

function stated(value, longest) {
  const text = typeof value === 'string' ? value.trim() : '';
  return text.length > 0 ? text.slice(0, longest) : null;
}

function writtenTags(tags) {
  const written = {};
  for (const [key, value] of Object.entries(tags ?? {})) {
    const text = typeof value === 'string' ? value.trim() : '';
    if (text.length > 0) written[key] = text;
  }
  return Object.keys(written).length > 0 ? written : null;
}

/** Which family this row belongs to, or null when nothing here can tell. */
function classify(record) {
  const tags = record.raw_tags ?? {};
  const operator = tags.operator ?? '';
  const name = record.nombre ?? '';
  const amenity = record.amenity;
  const healthcare = record.healthcare;

  if (CAJA_DE_SALUD.test(operator) || CAJA_DE_SALUD.test(name)) {
    return { code: 'CAJA_DE_SALUD', tag: `operator=${operator || name}`, isDoctorsShaped: false };
  }
  if (amenity === 'hospital') return { code: 'HOSPITAL', tag: 'amenity=hospital' };
  if (amenity === 'pharmacy') return { code: 'FARMACIA', tag: 'amenity=pharmacy' };
  if (amenity === 'doctors') {
    return {
      code: healthcare === 'dentist' ? 'CONSULTORIO_ODONTOLOGICO' : 'CONSULTORIO_MEDICO',
      tag: `amenity=doctors${healthcare ? `,healthcare=${healthcare}` : ''}`,
      isDoctorsShaped: true,
    };
  }
  if (amenity === 'dentist') {
    return { code: 'CONSULTORIO_ODONTOLOGICO', tag: 'amenity=dentist', isDoctorsShaped: true };
  }
  if (amenity === 'laboratory' || healthcare === 'laboratory') {
    return { code: 'LABORATORIO_CLINICO', tag: 'healthcare=laboratory' };
  }
  if (amenity === 'blood_donation' || healthcare === 'blood_donation') {
    return { code: 'BANCO_SANGRE', tag: 'healthcare=blood_donation' };
  }
  if (amenity === 'nursing_home') {
    return { code: 'CENTRO_ADULTO_MAYOR', tag: 'amenity=nursing_home' };
  }
  if (healthcare === 'dialysis') return { code: 'CENTRO_DIALISIS', tag: 'healthcare=dialysis' };
  if (amenity === 'clinic' || healthcare === 'centre' || healthcare === 'clinic') {
    if (NAMES_POSTA.test(name))
      return { code: 'POSTA_SANITARIA', tag: 'amenity=clinic,name~posta' };
    if (NAMES_PUESTO.test(name)) {
      return { code: 'PUESTO_DE_SALUD', tag: 'amenity=clinic,name~puesto_de_salud' };
    }
    if (NAMES_POLICONSULTORIO.test(name)) {
      return { code: 'POLICONSULTORIO', tag: 'amenity=clinic,name~policonsultorio' };
    }
    if (PUBLIC_OPERATOR.test(operator) || NAMES_CENTRO_SALUD.test(name)) {
      return { code: 'CENTRO_SALUD', tag: 'amenity=clinic,operator~publico' };
    }
    return {
      code: 'CLINICA_PRIVADA',
      tag: 'amenity=clinic,sin_senal_de_propiedad',
      defaulted: true,
    };
  }
  return null;
}

/** The codes anexo_A_201 decided, read from the merged catalogue. */
function annexDecidedCodes(catalogueDocument) {
  const codes = new Set();
  for (const family of catalogueDocument.familias ?? []) {
    if (family.decided_by === 'anexo_A_201') codes.add(family.code);
  }
  return codes;
}

/** One health place, in the shape `bolivia-national-poi-v3` already uses. */
function toHealthPlace(record, family, classification, resemblance, snapshotTakenAt, annexCodes) {
  const tags = record.raw_tags ?? {};
  const isDoctorsShaped = classification.isDoctorsShaped === true;
  const phones = isDoctorsShaped ? [] : taggedValues(tags, PHONE_TAGS, 4, 60);
  const emails = isDoctorsShaped ? [] : taggedValues(tags, EMAIL_TAGS, 5, 200);
  const websites = isDoctorsShaped ? [] : taggedValues(tags, WEBSITE_TAGS, 4, 2000);
  const socials = isDoctorsShaped ? [] : taggedValues(tags, SOCIAL_TAGS, 4, 500);
  const reachable = phones.length + emails.length + websites.length > 0;
  const [, kind, numericId] = record.id.split(':');
  const warnings = [];
  if (classification.defaulted) warnings.push('clasificacion_por_defecto_sin_senal_de_propiedad');
  if (isDoctorsShaped) warnings.push('contacto_omitido_posible_dato_personal');

  return {
    placeId: record.id,
    publisherRecordId: numericId,
    publisher: 'OpenStreetMap contributors',
    name: record.nombre.trim().slice(0, 300),
    locality: stated(tags['addr:city'], 160),
    department: null,
    address: addressFromTags(tags),
    latitude: record.latitud,
    longitude: record.longitud,
    entityGroup: family.group,
    entityFamily: classification.code,
    commercialRole: family.commercialRole,
    isRegulated: family.isRegulated,
    officialValidationSource: family.officialValidationSource,
    validationPriority: family.isRegulated ? 'HIGH' : 'NORMAL',
    genericFamily: false,
    classificationMethod: annexCodes.has(classification.code)
      ? 'puente_explicito_tags_osm_a_codigos_existentes'
      : 'puente_explicito_tags_osm_a_catalogo_salud_manual_2026',
    categoryKey: classification.tag.slice(0, 120),
    taxonomyHierarchy: [],
    basicCategory: null,
    confidence: null,
    positionMethod: record.metodo_posicion,
    dataLevel: reachable ? 'CONTACTO_Y_DIRECCION_PUBLICADOS' : 'NOMBRE_ACTIVIDAD_Y_COORDENADAS',
    phones,
    emails,
    websites,
    socials,
    warnings,
    sourceDatasetUrl: 'https://download.geofabrik.de/south-america/bolivia-260922.osm.pbf',
    sourceRecordUrl: `https://www.openstreetmap.org/${kind}/${numericId}`,
    snapshotTakenAt,
    sourceTags: writtenTags(tags),
    openingHours: stated(tags.opening_hours, 400),
    resemblesHeldPlace: resemblance,
    licence: 'ODbL-1.0',
    observationId: record.id,
  };
}

/**
 * Reads the extract, classifies every row it can, and drops what it cannot.
 * `heldPlaceIds` skips what any place seed already stores — most of this
 * extract is a repeat of what the national and establishments corpora
 * already loaded from OpenStreetMap, not a gap — never reclassifying it.
 */
export async function readHealthOsmDelivery(extract, doc, catalogue, heldPlaceIds, heldGrid) {
  const records = extract.registros ?? [];
  const annexCodes = annexDecidedCodes(doc);
  const rejected = {
    alreadyHeld: 0,
    offPlanet: 0,
    outsideCountry: 0,
    personName: 0,
    unclassified: 0,
  };
  const missingFamilies = new Map();
  const places = [];
  const seen = new Map();
  const snapshotAt = extract.extraction?.extractedAt ?? null;
  let resembling = 0;

  for (const record of records) {
    if (heldPlaceIds.has(record.id)) {
      rejected.alreadyHeld += 1;
      continue;
    }
    const { latitud: latitude, longitud: longitude } = record;
    if (!(latitude >= -90 && latitude <= 90 && longitude >= -180 && longitude <= 180)) {
      rejected.offPlanet += 1;
      continue;
    }
    if (!withinCountry(latitude, longitude)) {
      rejected.outsideCountry += 1;
      continue;
    }
    const classification = classify(record);
    if (!classification) {
      rejected.unclassified += 1;
      continue;
    }
    if (
      classification.isDoctorsShaped &&
      BARE_PERSON_NAME.test(record.nombre.trim()) &&
      !NAMES_A_PRACTICE.test(record.nombre)
    ) {
      rejected.personName += 1;
      continue;
    }
    const family = catalogue.get(classification.code);
    if (!family) {
      const missing = missingFamilies.get(classification.code) ?? {
        records: 0,
        categories: new Set(),
      };
      missing.records += 1;
      missing.categories.add(classification.tag);
      missingFamilies.set(classification.code, missing);
      continue;
    }
    if (seen.has(record.id)) continue;
    seen.set(record.id, true);

    const resemblance = resemblanceTo(heldGrid, record);
    if (resemblance) resembling += 1;
    places.push(toHealthPlace(record, family, classification, resemblance, snapshotAt, annexCodes));
  }

  return { places, rejected, missingFamilies, resembling, read: records.length };
}
