/**
 * Lee la descarga de comercio y servicios de Santa Cruz de la Sierra y la
 * convierte en lugares nuevos.
 *
 * Es la misma forma que la ampliación por rubros (`read-osm-expansion.mjs`),
 * reducida a una sola área: lo que el corpus ya tiene no vuelve a entrar, por
 * identificador primero y por nombre y distancia después; la familia la
 * decide una tabla de etiquetas y nunca un residuo (`scz-enrichment-classify.mjs`);
 * y lo que la tabla no reconoce, o para lo que el catálogo no define familia,
 * no se suma — no hay `OTRA_ENTIDAD` ni `OV_SERVICES_AND_BUSINESS` en esta
 * siembra, que es justo lo que el encargo pidió evitar.
 *
 * `locality` y `department` no llegan en la etiqueta la mayoría de las veces
 * —OpenStreetMap publica `addr:city` en pocos nodos—, y se completan con
 * «Santa Cruz de la Sierra» / «Santa Cruz» cuando faltan: no es una
 * inferencia, es lo que la propia consulta garantiza al filtrar por
 * pertenencia al área administrativa de ese municipio (`area(3604511527)`).
 */

import { readFile } from 'node:fs/promises';
import { classifySczCommerce } from './scz-enrichment-classify.mjs';
import { indexHeld, nearestNamesake, stated, toOsmPlace } from './osm-expansion-place.mjs';

export { indexHeld } from './osm-expansion-place.mjs';

const DEFAULT_LOCALITY = 'Santa Cruz de la Sierra';
const DEFAULT_DEPARTMENT = 'Santa Cruz';

/** Un nombre que es solo un número de local o de puesto de un mercado. */
const STALL_NUMBER = /(?:^|[\s-])(?:puesto|local|stand|box)[\s.-]*n?[°º.]?\s*\d+\s*$/iu;

/**
 * Lee todos los crudos del directorio y devuelve los lugares nuevos.
 *
 * `heldIds` son los identificadores de OpenStreetMap que el corpus ya tiene
 * (nodo, vía o relación) y `heldGrid` es su índice por nombre y distancia,
 * construido con `indexHeld` sobre **todas** las siembras de lugares del
 * disco — no solo las nacionales, también las de tres ciudades, que es donde
 * ya vive buena parte de lo que Overture trajo de Santa Cruz.
 */
export async function readSczEnrichmentOsm(files, catalogue, decisions, heldIds, heldGrid) {
  const places = new Map();
  const rejected = {
    alreadyHeldById: 0,
    alreadyHeldByName: 0,
    sinNombrePublicable: 0,
    numeroDePuestoOLocal: 0,
    sinFamiliaReconocida: 0,
    outsideCountry: 0,
  };
  const missingFamilies = new Map();
  let resembling = 0;

  for (const file of files) {
    const parsed = JSON.parse(await readFile(file.path, 'utf8'));
    const snapshot = parsed.osm3s?.timestamp_osm_base ?? null;
    for (const element of parsed.elements) {
      const tags = element.tags ?? {};
      if (!stated(tags.name, 300)) {
        rejected.sinNombrePublicable += 1;
        continue;
      }
      if (STALL_NUMBER.test(tags.name)) {
        rejected.numeroDePuestoOLocal += 1;
        continue;
      }
      const placeId = `osm:${element.type}:${element.id}`;
      if (places.has(placeId)) continue;
      if (heldIds.has(placeId) || heldIds.has(`osm:*:${element.id}`)) {
        rejected.alreadyHeldById += 1;
        continue;
      }
      const classification = classifySczCommerce(tags);
      if (!classification) {
        rejected.sinFamiliaReconocida += 1;
        continue;
      }
      const family = catalogue.get(classification.family);
      if (!family) {
        missingFamilies.set(
          classification.family,
          (missingFamilies.get(classification.family) ?? 0) + 1,
        );
        continue;
      }
      const latitude = element.type === 'node' ? element.lat : element.center?.lat;
      const longitude = element.type === 'node' ? element.lon : element.center?.lon;
      if (!(latitude >= -18.1 && latitude <= -17.4 && longitude >= -63.4 && longitude <= -62.7)) {
        rejected.outsideCountry += 1;
        continue;
      }
      const namesake = nearestNamesake(heldGrid, tags.name, latitude, longitude);
      if (namesake?.same) {
        rejected.alreadyHeldByName += 1;
        continue;
      }
      const resemblance = namesake?.resemblance ?? null;
      if (resemblance) resembling += 1;
      const method =
        decisions.get(classification.family) === 'anexo_A_201'
          ? 'puente_explicito_tags_osm_a_codigos_existentes'
          : 'puente_explicito_tags_osm_a_catalogo_2330';
      const place = toOsmPlace(element, {
        family,
        classification,
        department: DEFAULT_DEPARTMENT,
        snapshot,
        resemblance,
        method,
      });
      if (place.locality === null) place.locality = DEFAULT_LOCALITY;
      places.set(placeId, place);
    }
  }

  return { places: [...places.values()], rejected, missingFamilies, resembling };
}
