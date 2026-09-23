/**
 * La consulta a Overpass de la ampliación comercial de Santa Cruz de la
 * Sierra, y el área administrativa que la acota.
 *
 * El municipio, no un rectángulo: Nominatim resuelve «Municipio Santa Cruz de
 * la Sierra» a la relación 4511527 de OpenStreetMap (comprobado el
 * 2026-09-23, `osm_type=relation`, `addresstype=city`), y Overpass expone esa
 * misma relación como área bajo el identificador `3600000000 + id`. Pedir el
 * área en vez de un rectángulo declarado a mano evita las esquinas de
 * Brasil o Paraguay que un bbox generoso arrastraría, y es más preciso que
 * los «siete anillos» que la petición original proponía a ojo: el polígono
 * real incluye las zonas periurbanas sin necesidad de ensancharlo.
 *
 * Tres grupos y no una sola consulta, por lo mismo que ya documentó
 * `download-transport-osm.mjs`: una consulta que junta comercio, gastronomía
 * y oficios sobre una ciudad de este tamaño agota el tiempo del intérprete
 * público antes de terminar, y un grupo que falla hoy no debe tirar los que
 * ya respondieron.
 *
 * Deliberadamente fuera, porque otra rama de hoy ya los carga o los va a
 * cargar: `amenity=pharmacy|hospital|clinic|doctors|dentist|laboratory|
 * blood_donation|nursing_home` y cualquier `healthcare=*` (salud),
 * `amenity=school|college|university` (SIE), `amenity=bank` y cajeros
 * (cajeros de Santa Cruz), `amenity=fuel` y `shop=gas` (ANH), y todo lo que
 * `osm-expansion-query.mjs` ya pide a nivel país: `office=financial|
 * insurance|financial_advisor|cooperative|government|telecommunication`,
 * `shop=mobile_phone|telecommunication|agrarian|farm`,
 * `leisure=sports_centre|stadium|pitch|swimming_pool|golf_course|
 * fitness_centre|track`, `amenity=townhall|courthouse|police|fire_station|
 * place_of_worship|theatre|arts_centre|community_centre|marketplace`.
 */

/** Relación 4511527 de OpenStreetMap, resuelta por Nominatim el 2026-09-23. */
export const SANTA_CRUZ_AREA_ID = 3604511527;
export const SANTA_CRUZ_RELATION_ID = 4511527;

export const QUERY_GROUPS = [
  [
    'comercio-minorista',
    [
      '["shop"~"^(supermarket|convenience|kiosk|general|grocery|hardware|doityourself|butcher|greengrocer|bakery|confectionery|ice_cream|alcohol|beverages|clothes|fashion|shoes|jewelry|watches|optician|books|stationery|copyshop|toys|electronics|appliance|computer|pet|florist|department_store|mall|second_hand|bicycle|sports|variety_store|car_repair|tyres|car_wash|laundry|dry_cleaning|hairdresser|beauty)$"]',
    ],
  ],
  ['gastronomia', ['["amenity"~"^(restaurant|fast_food|cafe|bar|pub)$"]']],
  [
    'oficios-y-servicios',
    [
      '["office"~"^(lawyer|notary|estate_agent|architect|engineer|it|advertising_agency|travel_agent|logistics)$"]',
      '["craft"~"^(electrician|plumber|locksmith|tailor|photographer|shoemaker)$"]',
      '["amenity"~"^(veterinary|driving_school|casino|cinema)$"]',
    ],
  ],
  /*
   * Segunda vuelta, con etiquetas que la primera no pidió. La medida contra
   * el corpus mostró que el 84% de lo que la primera vuelta trajo ya estaba
   * cargado por el mismo identificador de OpenStreetMap: otra descarga de hoy
   * ya había leído ese mismo vocabulario de etiquetas. Este grupo prueba
   * comercio especializado y oficios que ninguna rama de hoy pidió todavía.
   */
  [
    'comercio-especializado',
    [
      '["shop"~"^(houseware|garden_centre|musical_instrument|art|antiques|gift|bag|leather|deli|seafood|water|newsagent|tobacco|funeral_directors|pawnbroker)$"]',
      '["amenity"="nightclub"]',
      '["office"~"^(consulting|ngo)$"]',
    ],
  ],
];

/** La consulta exacta de un grupo, que el manifiesto guarda junto al crudo que devolvió. */
export function overpassQuery(filters, timeoutSeconds = 600) {
  const lines = filters.map((filter) => `  nwr${filter}["name"](area.d);`);
  return `[out:json][timeout:${timeoutSeconds}];\narea(${SANTA_CRUZ_AREA_ID})->.d;\n(\n${lines.join('\n')}\n);\nout center tags;`;
}
