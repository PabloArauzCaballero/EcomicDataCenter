/**
 * Lee la descarga de OpenStreetMap por departamento y la convierte en lugares.
 *
 * Es la sexta entrega del corpus y la primera que no trae nadie: la descarga el
 * propio observatorio, con `fetch-osm-expansion.mjs`, para cubrir los rubros que
 * el tablero enseña casi vacios. En Santa Cruz, sobre 18.614 lugares, habia 4
 * de agro, 143 de industria, 69 de telecomunicaciones y ninguno de mineria. No
 * es que Bolivia no tenga minas: es que ninguna entrega anterior las pidio.
 *
 * Tres reglas, las tres heredadas de las entregas anteriores y por lo mismo:
 *
 *  - Lo que el corpus ya tiene no vuelve a entrar. Por identificador primero —
 *    un nodo de OpenStreetMap que la entrega nacional ya trajo es el mismo
 *    nodo—, y despues por nombre y distancia, que es lo unico que puede ver que
 *    la iglesia que Overture llama de una forma es la que OpenStreetMap llama de
 *    otra. El mismo nombre a menos de cien metros se descarta; un nombre
 *    parecido se marca con `resemblesHeldPlace` y entra, porque fundirlo podria
 *    borrar una segunda sede real.
 *  - La familia la decide una tabla, etiqueta por etiqueta, y no una
 *    heuristica sobre el nombre salvo en los tres casos que la propia tabla
 *    dice (`osm-expansion-classify.mjs`).
 *    Lo que la tabla no reconoce no entra: no hay familia de residuo en esta
 *    siembra, porque el residuo es justo lo que se vino a reducir.
 *  - Un area de uso de suelo no es un establecimiento. Un cultivo con nombre o
 *    una cantera son un lugar economico real, pero su coordenada es el centro
 *    de un poligono y no una puerta; la fila lo dice en `positionMethod` y en
 *    `warnings`.
 */

import { readFile } from 'node:fs/promises';
import { CADASTRAL_PARCEL, INDUSTRIAL_SKIPPED, classifyOsm } from './osm-expansion-classify.mjs';
import { nearestNamesake, stated, toOsmPlace } from './osm-expansion-place.mjs';

export { DEPARTMENT_AREAS, overpassQuery } from './osm-expansion-query.mjs';
export { classifyOsm } from './osm-expansion-classify.mjs';
export { indexHeld } from './osm-expansion-place.mjs';

/**
 * Lee los crudos de todos los departamentos y devuelve los lugares nuevos.
 *
 * `heldIds` son los identificadores de OpenStreetMap que el corpus ya tiene,
 * con su tipo y sin el: la entrega nacional trae 8.200 lugares por Geofabrik,
 * que no dice si el objeto era un nodo o una via, y para no volver a cargar
 * ninguno de esos se descarta todo numero que ya este, sea del tipo que sea.
 */
export async function readOsmExpansion(files, catalogue, annex, additions, heldIds, heldGrid) {
  const places = new Map();
  const rejected = {
    alreadyHeldById: 0,
    alreadyHeldByName: 0,
    otherBranch: 0,
    unclassified: 0,
    acrossDepartments: 0,
    cadastralParcel: 0,
    outsideCountry: 0,
  };
  const missingFamilies = new Map();
  let resembling = 0;

  for (const file of files) {
    const parsed = JSON.parse(await readFile(file.path, 'utf8'));
    const snapshot = parsed.osm3s?.timestamp_osm_base ?? null;
    for (const element of parsed.elements) {
      const tags = element.tags ?? {};
      if (!stated(tags.name, 300)) continue;
      const placeId = `osm:${element.type}:${element.id}`;
      /*
       * Un objeto que aparece en dos departamentos cruza su limite: el Salar de
       * Uyuni esta en el area de Oruro y en la de Potosi. Quedarse con el
       * primero que llego diria un departamento que depende del orden de la
       * descarga, asi que la fila queda sin departamento y lo avisa.
       */
      const already = places.get(placeId);
      if (already) {
        if (already.department !== null) {
          already.department = null;
          already.warnings.push('cruza_limite_departamental');
          rejected.acrossDepartments += 1;
        }
        continue;
      }
      /*
       * Una parcela numerada de un catastro importado —«COMUNIDAD CHAHUIRA
       * GRANDE - PARCELA 869», «Parc-12»— es un predio, no un lugar economico
       * con nombre. Fueron 1.103 en la descarga del 2026-09-23 y, contadas,
       * harian del agro un catastro. No entran.
       */
      if (CADASTRAL_PARCEL.test(tags.name)) {
        rejected.cadastralParcel += 1;
        continue;
      }
      if (heldIds.has(placeId) || heldIds.has(`osm:*:${element.id}`)) {
        rejected.alreadyHeldById += 1;
        continue;
      }
      const classification = classifyOsm(tags);
      if (!classification) {
        if (tags.industrial && INDUSTRIAL_SKIPPED.has(tags.industrial)) rejected.otherBranch += 1;
        else rejected.unclassified += 1;
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
      if (!(latitude >= -23 && latitude <= -9 && longitude >= -70 && longitude <= -57)) {
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
      const method = additions.has(classification.family)
        ? 'puente_explicito_tags_osm_a_familias_ampliadas'
        : annex.has(classification.family)
          ? 'puente_explicito_tags_osm_a_codigos_existentes'
          : 'puente_explicito_tags_osm_a_catalogo_2330';
      places.set(
        placeId,
        toOsmPlace(element, {
          family,
          classification,
          department: file.department,
          snapshot,
          resemblance,
          method,
        }),
      );
    }
  }

  return { places: [...places.values()], rejected, missingFamilies, resembling };
}
