/**
 * Reads the hydrocarbons agency list of licensed fuel stations.
 *
 * The ANH publishes, per activity and per department, an HTML table of the
 * operators it licenses: company name, address and telephone, licence number,
 * products and a department, with the coordinate inside the «Mostrar
 * Ubicación» button (`setMark(lat, lon, name)`). The national view (`D=0`) is
 * the complete list; each departmental view drops its first row, measured on
 * 2026-09-23, which is why this reads the national one.
 *
 *  - The telephone does not travel. The page grants no licence to
 *    redistribute, and many are mobile numbers of the operator.
 *  - The identifier is the operator and establishment code the licence starts
 *    with (`ANH01986-CLES01`), not the licence, which is renewed every year.
 *  - The ANH declares a department and no municipality, so the 25 km test of
 *    the other readers cannot be applied. What is checked instead is that the
 *    nearest schools of the ministry register sit in the same department.
 */

import { inTitleCase } from './read-registry-delivery.mjs';
import { resemblanceTo } from './read-expansion-delivery.mjs';
import {
  computedPrecision,
  insideBolivia,
  stated,
  withoutDwelling,
} from './read-official-places.mjs';

const LICENCE = 'sin_licencia_abierta_expresa_verificada; lista publica de operadores de la ANH';
const FAMILY = 'SURTIDOR';

function plain(html) {
  return html
    .replace(/<br\s*\/?>/giu, '\n')
    .replace(/<[^>]+>/gu, '')
    .replace(/&nbsp;/gu, ' ')
    .replace(/&quot;/gu, '"')
    .replace(/&amp;/gu, '&');
}

/** The rows of the operators table, with the coordinate the button carries. */
export function anhRows(html) {
  const body = html.slice(html.indexOf('<tbody>'));
  const rows = [];
  for (const row of body.matchAll(/<tr>([\s\S]*?)<\/tr>/gu)) {
    const cells = [...row[1].matchAll(/<td[^>]*>([\s\S]*?)<\/td>/gu)].map((cell) => cell[1]);
    if (cells.length < 5) continue;
    const mark = /setMark\(\s*(-?[\d.]+)\s*,\s*(-?[\d.]+)\s*,/u.exec(cells[4]);
    const contact = plain(cells[1]);
    rows.push({
      razonSocial: stated(plain(cells[0]), 300),
      direccion: stated(/DIRECCI[ÓO]N:\s*([^\n]*)/u.exec(contact)?.[1], 300),
      licencia: stated(plain(cells[2]), 80),
      productos: stated(plain(cells[3]), 400),
      departamento: stated(plain(cells[4].split('<a')[0]), 40),
      latitud: mark ? Number(mark[1]) : null,
      longitud: mark ? Number(mark[2]) : null,
      rawLatitude: mark?.[1],
      rawLongitude: mark?.[2],
    });
  }
  return rows;
}

function toStationPlace(record, code, family, resemblance, context) {
  const { address, warning } = withoutDwelling(record.direccion);
  const warnings = ['licencia_del_regulador_no_verifica_estacion_abierta'];
  if (warning) warnings.push(warning);
  if (computedPrecision(record.rawLatitude, record.rawLongitude)) {
    warnings.push('coordenada_calculada_precision_no_declarable');
  }
  if (context.voted === null) warnings.push('departamento_sin_escuelas_cercanas_para_cotejar');
  return {
    placeId: `anh:estacion:${code}`,
    publisherRecordId: record.licencia,
    publisher: 'ANH',
    name: record.razonSocial.replace(/"\s*/gu, '').replace(/\s+/gu, ' ').trim(),
    locality: null,
    department: inTitleCase(record.departamento),
    address,
    latitude: record.latitud,
    longitude: record.longitud,
    entityGroup: family.group,
    entityFamily: FAMILY,
    commercialRole: family.commercialRole,
    isRegulated: family.isRegulated,
    officialValidationSource: family.officialValidationSource,
    validationPriority: family.isRegulated ? 'HIGH' : 'NORMAL',
    genericFamily: false,
    classificationMethod: 'actividad_declarada_por_el_regulador_en_su_registro',
    categoryKey: 'COMERCIALIZACION DE COMBUSTIBLES LIQUIDOS EN ESTACION DE SERVICIO',
    taxonomyHierarchy: [],
    basicCategory: null,
    confidence: null,
    positionMethod: 'coordenada_publicada_por_el_regulador_no_entrada_verificada',
    dataLevel: 'REGISTRO_DEL_REGULADOR_DIRECCION_DECLARADA',
    // Sin telefono, a proposito. Ver la cabecera.
    phones: [],
    emails: [],
    websites: [],
    socials: [],
    warnings,
    sourceDatasetUrl: context.sourceUrl,
    sourceRecordUrl: null,
    snapshotTakenAt: context.retrievedAt,
    sourceTags: {
      razon_social: record.razonSocial,
      licencia: record.licencia,
      ...(record.productos ? { productos: record.productos } : {}),
      actividad: 'COMERCIALIZACION DE COMBUSTIBLES LIQUIDOS EN ESTACION DE SERVICIO',
    },
    openingHours: null,
    resemblesHeldPlace: resemblance,
    licence: LICENCE,
    observationId: `anh:estacion:${code}`,
  };
}

/**
 * Reads the national table and keeps the stations whose position holds up.
 *
 * `voteDepartment(lat, lon)` answers which department the nearest schools of
 * the ministry register are in, or null when there is none within reach.
 */
export function readAnhDelivery(html, catalogue, held, voteDepartment, options) {
  const family = catalogue.get(FAMILY);
  if (!family) throw new Error(`el catalogo no define ${FAMILY}`);
  const rows = anhRows(html);
  const rejected = { alreadyHeld: 0, withoutCode: 0, withoutPosition: 0, otherDepartment: 0 };
  const places = [];
  const disagreements = [];
  let resembling = 0;
  let unchecked = 0;
  for (const record of rows) {
    const code = /^(ANH\d{3,8}-[A-Z]{2,8}\d{1,4})-LIC/u.exec(record.licencia ?? '')?.[1];
    if (!code || !record.razonSocial || !record.departamento) {
      rejected.withoutCode += 1;
      continue;
    }
    if (held.ids.has(`anh:estacion:${code}`)) {
      rejected.alreadyHeld += 1;
      continue;
    }
    if (record.latitud === null || !insideBolivia(record.latitud, record.longitud)) {
      rejected.withoutPosition += 1;
      continue;
    }
    const declared = inTitleCase(record.departamento);
    const voted = voteDepartment(record.latitud, record.longitud);
    if (voted !== null && voted !== declared) {
      rejected.otherDepartment += 1;
      disagreements.push({ code, declared, voted });
      continue;
    }
    if (voted === null) unchecked += 1;
    const resemblance = resemblanceTo(held.grid, { ...record, nombre: record.razonSocial });
    if (resemblance) resembling += 1;
    places.push(toStationPlace(record, code, family, resemblance, { ...options, voted }));
  }
  return { places, rejected, resembling, unchecked, disagreements, read: rows.length };
}
