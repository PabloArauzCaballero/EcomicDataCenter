/**
 * Reads the Google Maps markers of cajerosensantacruz.tel.bo.
 *
 * The page embeds a single script with one `google.maps.Marker` per cash
 * machine, each with an `InfoWindow` of bank name, branch name, address and a
 * schedule that is «24» for almost every one of them. The site is not a
 * regulator: ASFI supervises the banks, not this directory, and nothing here
 * says a bank stands behind the point a private webmaster placed on a map.
 * The publisher is named `Tel.bo`, and the licence says so in full.
 *
 *  - No phone travels: the page publishes none.
 *  - No municipality is declared per row, only the page's own claim to be
 *    about «Santa Cruz de la Sierra». The markers reach further than the
 *    city — Camiri, Puerto Suárez, San Ignacio de Velasco — and all of them
 *    are still municipalities of the Santa Cruz department, so the
 *    department is asserted for the whole file and checked against the
 *    nearest schools of the ministry register, the same way the ANH reader
 *    checks its own declared department.
 *  - A bank name the page misspells («BancoBisa», «Banco Unión Cajero») is
 *    folded into the bank it names and not kept as a second bank.
 *  - Two markers naming the same bank and branch at the same point are the
 *    same marker printed twice by the page's own script and are not counted
 *    twice.
 */

import { resemblanceTo } from './read-expansion-delivery.mjs';
import { computedPrecision, insideBolivia, stated } from './read-official-places.mjs';

const LICENCE = 'sin_licencia_abierta_expresa_verificada; directorio privado Tel.bo';
const FAMILY = 'CAJERO_ATM';
const DEPARTMENT = 'Santa Cruz';
/** Como escribe la pagina cada banco, y el nombre bajo el que se archiva. */
const BANK = new Map([
  ['Banco Nacional de Bolivia', 'Banco Nacional de Bolivia'],
  ['Banco de Crédito', 'Banco de Crédito'],
  ['Banco Mercantil Santa Cruz', 'Banco Mercantil Santa Cruz'],
  ['Banco Económico', 'Banco Económico'],
  ['Banco Bisa', 'Banco Bisa'],
  ['BancoBisa', 'Banco Bisa'],
  ['Banco Ganadero', 'Banco Ganadero'],
  ['Banco Sol', 'Banco Solidario'],
  ['Banco Solidario', 'Banco Solidario'],
  ['Banco Fie', 'Banco Fie'],
  ['Banco Fortaleza', 'Banco Fortaleza'],
  ['Banco Prodem', 'Banco Prodem'],
  ['Banco Fassil', 'Banco Fassil'],
  ['Banco Ecofuturo', 'Banco Ecofuturo'],
  ['Banco Unión', 'Banco Unión'],
  ['Banco Unión Cajero', 'Banco Unión'],
  ['Cooperativa Jesús Nazareno', 'Cooperativa Jesús Nazareno'],
]);

const MARKER = new RegExp(
  'new google\\.maps\\.LatLng\\(\\s*(-?\\d+\\.\\d+)\\s*,\\s*(-?\\d+\\.\\d+)\\s*\\),map: map\\}\\);' +
    "var infobanco\\d+ = new google\\.maps\\.InfoWindow\\(\\{content: '([\\s\\S]*?)'\\}\\)",
  'gu',
);

/** The markers of the page, in the order the script draws them. */
export function cajerosMarkers(html) {
  const markers = [];
  for (const match of html.matchAll(MARKER)) {
    const parts = match[3].split(/<br>/u).map((part) => part.replace(/<[^>]+>/gu, '').trim());
    markers.push({
      latitud: Number(match[1]),
      longitud: Number(match[2]),
      rawLatitude: match[1],
      rawLongitude: match[2],
      banco: stated(parts[0], 80),
      sucursal: stated(parts[1], 200),
      direccion: stated(parts[2], 300),
      horario: stated(parts[3], 120),
    });
  }
  return markers;
}

function toAtmPlace(record, bank, family, id, resemblance, context) {
  const name =
    record.sucursal && record.sucursal !== `${record.latitud}, ${record.longitud}`
      ? `${bank} - ${record.sucursal}`
      : bank;
  const warnings = ['directorio_privado_no_lo_respalda_el_banco_ni_el_supervisor'];
  if (computedPrecision(record.rawLatitude, record.rawLongitude)) {
    warnings.push('coordenada_calculada_precision_no_declarable');
  }
  if (context.voted === null) warnings.push('departamento_sin_escuelas_cercanas_para_cotejar');
  return {
    placeId: `tel_bo:cajero:${id}`,
    publisherRecordId: id,
    publisher: 'Tel.bo',
    name: name.slice(0, 300),
    locality: null,
    department: DEPARTMENT,
    address: record.direccion,
    latitude: record.latitud,
    longitude: record.longitud,
    entityGroup: family.group,
    entityFamily: FAMILY,
    commercialRole: family.commercialRole,
    isRegulated: family.isRegulated,
    officialValidationSource: family.officialValidationSource,
    validationPriority: family.isRegulated ? 'HIGH' : 'NORMAL',
    genericFamily: false,
    classificationMethod: 'actividad_declarada_por_un_directorio_privado',
    categoryKey: bank,
    taxonomyHierarchy: [],
    basicCategory: null,
    confidence: null,
    positionMethod: 'coordenada_publicada_por_un_directorio_privado_no_entrada_verificada',
    dataLevel: 'DIRECTORIO_PRIVADO_DIRECCION_DECLARADA',
    // Sin telefono: la pagina no publica ninguno. Ver la cabecera.
    phones: [],
    emails: [],
    websites: [],
    socials: [],
    warnings,
    sourceDatasetUrl: context.sourceUrl,
    sourceRecordUrl: null,
    snapshotTakenAt: context.retrievedAt,
    sourceTags: {
      banco: bank,
      ...(record.sucursal ? { sucursal: record.sucursal } : {}),
      ...(record.horario ? { horario: record.horario } : {}),
    },
    // «-» es como la pagina escribe que no publica horario para esa fila.
    openingHours:
      record.horario === '24' ? '24 horas' : record.horario === '-' ? null : record.horario,
    resemblesHeldPlace: resemblance,
    licence: LICENCE,
    observationId: `tel_bo:cajero:${id}`,
  };
}

/**
 * Reads the page and keeps the markers whose bank is named and whose
 * position holds up.
 *
 * `fingerprintOf(record)` mints the identifier for a marker the page numbers
 * itself: content-derived, so the same marker read twice hashes the same.
 */
export function readCajerosDelivery(html, catalogue, held, voteDepartment, fingerprintOf, context) {
  const family = catalogue.get(FAMILY);
  if (!family) throw new Error(`el catalogo no define ${FAMILY}`);
  const markers = cajerosMarkers(html);
  const rejected = {
    alreadyHeld: 0,
    withoutBank: 0,
    outsideCountry: 0,
    otherDepartment: 0,
    duplicateInDelivery: 0,
  };
  const seen = new Set();
  const places = [];
  const disagreements = [];
  let resembling = 0;
  let unchecked = 0;
  for (const record of markers) {
    const bank = BANK.get(record.banco ?? '');
    if (!bank) {
      rejected.withoutBank += 1;
      continue;
    }
    if (!insideBolivia(record.latitud, record.longitud)) {
      rejected.outsideCountry += 1;
      continue;
    }
    const id = fingerprintOf(bank, record.sucursal ?? '', record.rawLatitude, record.rawLongitude);
    if (seen.has(id)) {
      rejected.duplicateInDelivery += 1;
      continue;
    }
    seen.add(id);
    if (held.ids.has(`tel_bo:cajero:${id}`)) {
      rejected.alreadyHeld += 1;
      continue;
    }
    const voted = voteDepartment(record.latitud, record.longitud);
    if (voted !== null && voted !== DEPARTMENT) {
      rejected.otherDepartment += 1;
      disagreements.push({ bank, sucursal: record.sucursal, voted });
      continue;
    }
    if (voted === null) unchecked += 1;
    const resemblance = resemblanceTo(held.grid, { ...record, nombre: bank });
    if (resemblance) resembling += 1;
    places.push(toAtmPlace(record, bank, family, id, resemblance, { ...context, voted }));
  }
  return { places, rejected, resembling, unchecked, disagreements, read: markers.length };
}
