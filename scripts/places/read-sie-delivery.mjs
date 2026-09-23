/**
 * Reads the Ministry of Education list of schools, as the SIE exports it.
 *
 * The export is an Excel 2003 XML workbook (SpreadsheetML), one sheet, with a
 * seven-line heading, a footnote at the end and one row per educational unit
 * that the ministry lists as «abierta legalmente establecida» for the current
 * school year. Every row carries the R.U.E. —the register code the ministry
 * assigns— and a coordinate the ministry publishes itself.
 *
 * What it does with them:
 *
 *  - It drops the director. The column names a person, and the corpus is read
 *    by a public report. Nothing about the school needs it.
 *  - It keeps level, shift, dependency (fiscal, convenio, privada) and the
 *    educational district in `sourceTags`, in the ministry's own words. There
 *    is no enrolment per school in this export: the SIE publishes enrolment
 *    only aggregated, and none is invented here.
 *  - It refuses a coordinate that contradicts its row, by the same rule as the
 *    SEPREC and AGEMED readers: more than `limitKm` from the median of the
 *    schools of its own municipality. The municipality is grouped with its
 *    department in front, because Bolivia has two San Ignacio and two San Pedro.
 *  - It files the adult and special education centres under their own family.
 *    They are in the same list and they are not schools.
 */

import { inTitleCase } from './read-registry-delivery.mjs';
import { resemblanceTo } from './read-expansion-delivery.mjs';
import {
  centresBy,
  computedPrecision,
  insideBolivia,
  metresBetween,
  stated,
  withoutDwelling,
} from './read-official-places.mjs';

const LICENCE =
  'sin_licencia_abierta_expresa_verificada; reporte publico del SIE, Ministerio de Educacion';
const SUBSYSTEM_FAMILY = new Map([
  ['Regular', 'COLEGIO_ESCUELA'],
  ['Alternativa y Especial', 'CENTRO_EDUCACION_ALTERNATIVA_ESPECIAL'],
]);
/** Las columnas del informe, por la posicion que ocupan una vez leidos los indices. */
const COLUMN = {
  departmentCode: 0,
  department: 1,
  municipality: 2,
  districtCode: 4,
  district: 5,
  subsystem: 6,
  dependency: 7,
  shift: 8,
  levels: 9,
  building: 11,
  rue: 12,
  name: 13,
  zone: 14,
  address: 15,
  latitude: 18,
  longitude: 19,
};

function decoded(text) {
  return text
    .replace(/&lt;/gu, '<')
    .replace(/&gt;/gu, '>')
    .replace(/&quot;/gu, '"')
    .replace(/&#39;/gu, "'")
    .replace(/&#10;/gu, ' ')
    .replace(/&amp;/gu, '&');
}

/**
 * The rows of a SpreadsheetML sheet, with every cell in its real column.
 *
 * A cell may skip ahead with `ss:Index` and span with `ss:MergeAcross`, and a
 * reader that ignores either shifts every later column of the row — which is
 * how a street lands in the director's column.
 */
export function spreadsheetRows(text) {
  const rows = [];
  for (const row of text.matchAll(/<Row\b[^>]*>([\s\S]*?)<\/Row>/gu)) {
    const cells = [];
    let column = 0;
    for (const cell of row[1].matchAll(/<Cell\b([^>]*?)(?:\/>|>([\s\S]*?)<\/Cell>)/gu)) {
      const index = /ss:Index="(\d+)"/u.exec(cell[1]);
      if (index) column = Number(index[1]) - 1;
      const data = cell[2] ? /<Data\b[^>]*>([\s\S]*?)<\/Data>/u.exec(cell[2]) : null;
      cells[column] = data ? decoded(data[1]).trim() : '';
      const merged = /ss:MergeAcross="(\d+)"/u.exec(cell[1]);
      column += 1 + (merged ? Number(merged[1]) : 0);
    }
    rows.push(cells);
  }
  return rows;
}

/** «CAPITAL (SANTA CRUZ DE LA SIERRA)» es la seccion; el municipio va entre parentesis. */
function municipalityName(section) {
  const inside = /\(([^)]+)\)\s*$/u.exec(section ?? '');
  return inTitleCase(inside ? inside[1] : (section ?? ''));
}

function toRecord(cells) {
  const at = (name) => cells[COLUMN[name]] ?? '';
  return {
    rue: at('rue'),
    nombre: at('name'),
    departamento: at('department'),
    municipio: at('municipality'),
    latitud: Number(at('latitude')),
    longitud: Number(at('longitude')),
    cells,
    at,
  };
}

function toSchoolPlace(record, family, familyCode, resemblance, retrievedAt, sourceUrl) {
  const { at } = record;
  const line = [stated(at('address'), 240), stated(at('zone'), 60)]
    .filter((part, index, parts) => part && (index === 0 || part !== parts[0]))
    .join(', ');
  const { address, warning } = withoutDwelling(line.length > 0 ? line.slice(0, 300) : null);
  const warnings = ['registro_educativo_informacion_preliminar_segun_el_ministerio'];
  if (warning) warnings.push(warning);
  if (computedPrecision(at('latitude'), at('longitude'))) {
    warnings.push('coordenada_calculada_precision_no_declarable');
  }
  if (!stated(at('shift'), 80)) warnings.push('sin_turno_publicado');
  const tags = {
    departamento_codigo: at('departmentCode'),
    municipio_seccion: at('municipality'),
    distrito_codigo: at('districtCode'),
    distrito_educativo: at('district'),
    subsistema: at('subsystem'),
    dependencia: at('dependency'),
    turno: at('shift'),
    nivel_autorizado: at('levels'),
    codigo_edificio: at('building'),
  };
  for (const key of Object.keys(tags)) if (!stated(tags[key], 400)) delete tags[key];
  return {
    placeId: `sie:rue:${record.rue}`,
    publisherRecordId: record.rue,
    publisher: 'Ministerio de Educacion (SIE)',
    name: stated(record.nombre, 300),
    locality: municipalityName(record.municipio),
    department: inTitleCase(record.departamento),
    address,
    latitude: record.latitud,
    longitude: record.longitud,
    entityGroup: family.group,
    entityFamily: familyCode,
    commercialRole: family.commercialRole,
    isRegulated: family.isRegulated,
    officialValidationSource: family.officialValidationSource,
    validationPriority: family.isRegulated ? 'HIGH' : 'NORMAL',
    genericFamily: false,
    classificationMethod: 'actividad_declarada_por_el_regulador_en_su_registro',
    categoryKey: `${at('subsystem')} | ${at('dependency')}`.slice(0, 120),
    taxonomyHierarchy: [],
    basicCategory: null,
    confidence: null,
    positionMethod: 'coordenada_publicada_por_el_regulador_no_entrada_verificada',
    dataLevel: 'REGISTRO_DEL_REGULADOR_DIRECCION_DECLARADA',
    // Sin contactos y sin director, a proposito. Ver la cabecera.
    phones: [],
    emails: [],
    websites: [],
    socials: [],
    warnings,
    sourceDatasetUrl: sourceUrl,
    sourceRecordUrl: null,
    snapshotTakenAt: retrievedAt,
    sourceTags: tags,
    openingHours: null,
    resemblesHeldPlace: resemblance,
    licence: LICENCE,
    observationId: `sie:rue:${record.rue}`,
  };
}

/**
 * Reads the export and turns into places the rows whose position holds up.
 *
 * `held` is what the observatory already stores: identifiers so the same
 * register does not land twice, and the grid for `resemblesHeldPlace`.
 */
export function readSieDelivery(text, catalogue, held, options) {
  const { limitKm = 25, retrievedAt, sourceUrl } = options;
  const rows = spreadsheetRows(text);
  const isData = (cells) => /^\d+$/u.test(cells[COLUMN.departmentCode] ?? '') && cells.length > 15;
  const records = rows.filter(isData).map(toRecord);
  // Lo que el ministerio escribe alrededor de la tabla: titulo, criterio y notas.
  const heading = rows.filter((cells) => !isData(cells)).map((cells) => cells.filter(Boolean));
  const rejected = {
    alreadyHeld: 0,
    withoutCode: 0,
    outsideCountry: 0,
    farFromMunicipality: 0,
    unknownSubsystem: 0,
  };
  const located = [];
  for (const record of records) {
    if (!/^\d{6,10}$/u.test(record.rue) || !stated(record.nombre, 300)) {
      rejected.withoutCode += 1;
    } else if (held.ids.has(`sie:rue:${record.rue}`)) {
      rejected.alreadyHeld += 1;
    } else if (!insideBolivia(record.latitud, record.longitud)) {
      // 96 filas publican 0,0: el ministerio no tiene su coordenada.
      rejected.outsideCountry += 1;
    } else {
      located.push(record);
    }
  }
  const keyOf = (record) => `${record.departamento}|${record.municipio}`;
  const centres = centresBy(located, keyOf);
  const places = [];
  const farRows = [];
  let resembling = 0;
  for (const record of located) {
    const centre = centres.get(keyOf(record));
    const km =
      metresBetween(record.latitud, record.longitud, centre.latitude, centre.longitude) / 1000;
    if (km > limitKm) {
      rejected.farFromMunicipality += 1;
      farRows.push({ rue: record.rue, municipio: record.municipio, km: Math.round(km) });
      continue;
    }
    const familyCode = SUBSYSTEM_FAMILY.get(record.at('subsystem'));
    const family = familyCode ? catalogue.get(familyCode) : null;
    if (!family) {
      rejected.unknownSubsystem += 1;
      continue;
    }
    const resemblance = resemblanceTo(held.grid, record);
    if (resemblance) resembling += 1;
    places.push(toSchoolPlace(record, family, familyCode, resemblance, retrievedAt, sourceUrl));
  }
  return { places, rejected, resembling, read: records.length, farRows, heading };
}
