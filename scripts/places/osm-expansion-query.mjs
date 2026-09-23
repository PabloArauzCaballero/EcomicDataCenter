/**
 * La consulta a Overpass de la ampliacion por rubros, y los nueve
 * departamentos que la acotan. Vive aparte para que la descarga y la lectura
 * usen exactamente la misma lista de etiquetas.
 */

/** Los nueve departamentos, por el area de OpenStreetMap que los delimita. */
export const DEPARTMENT_AREAS = [
  { iso: 'BO-B', name: 'Beni', areaId: 3600405935 },
  { iso: 'BO-C', name: 'Cochabamba', areaId: 3600393562 },
  { iso: 'BO-H', name: 'Chuquisaca', areaId: 3600396197 },
  { iso: 'BO-L', name: 'La Paz', areaId: 3600400473 },
  { iso: 'BO-N', name: 'Pando', areaId: 3603358584 },
  { iso: 'BO-O', name: 'Oruro', areaId: 3600395910 },
  { iso: 'BO-P', name: 'Potosí', areaId: 3604509552 },
  { iso: 'BO-S', name: 'Santa Cruz', areaId: 3603360565 },
  { iso: 'BO-T', name: 'Tarija', areaId: 3600396198 },
];

/*
 * Lo que se pide, por rubro. Solo con nombre: un lugar sin nombre no se puede
 * cotejar con lo que el corpus ya tiene ni lo puede buscar un lector.
 *
 * Fuera a proposito, porque otras ramas los estan cargando: educacion, salud,
 * transporte, bancos y cajeros, y surtidores de combustible.
 */
const SELECTORS = [
  // agro
  '["landuse"~"^(farmland|orchard|vineyard|greenhouse_horticulture|aquaculture|animal_keeping)$"]',
  '["place"="farm"]',
  '["shop"~"^(agrarian|farm)$"]',
  '["craft"~"^(agricultural_engines|beekeeper)$"]',
  '["man_made"="silo"]',
  // industria y mineria
  '["man_made"~"^(works|mineshaft|adit)$"]',
  '["landuse"~"^(industrial|quarry)$"]',
  '["industrial"]',
  '["craft"~"^(brewery|winery|distillery|sawmill)$"]',
  '["historic"="mine"]',
  // telecomunicaciones
  '["office"="telecommunication"]',
  '["shop"~"^(mobile_phone|telecommunication)$"]',
  // oficinas financieras, sin bancos ni cajeros
  '["office"~"^(financial|insurance|financial_advisor|cooperative)$"]',
  '["amenity"~"^(bureau_de_change|money_transfer|payment_centre)$"]',
  // gobierno y seguridad
  '["office"="government"]',
  '["amenity"~"^(townhall|courthouse|police|fire_station)$"]',
  // turismo, cultura y religion
  '["tourism"~"^(hotel|hostel|guest_house|motel|apartment|camp_site|alpine_hut|wilderness_hut|museum|gallery|attraction|viewpoint|information|artwork|zoo|theme_park)$"]',
  '["historic"~"^(monument|memorial|ruins|archaeological_site|castle)$"]',
  '["amenity"~"^(place_of_worship|monastery|theatre|arts_centre|community_centre|marketplace)$"]',
  // deporte
  '["leisure"~"^(sports_centre|stadium|pitch|swimming_pool|golf_course|fitness_centre|track)$"]',
  '["club"="sport"]',
];

/** La consulta exacta, que el manifiesto guarda junto al crudo que devolvio. */
export function overpassQuery(areaId) {
  const lines = SELECTORS.map((selector) => `  nwr${selector}["name"](area.d);`);
  return `[out:json][timeout:900];\narea(${areaId})->.d;\n(\n${lines.join('\n')}\n);\nout center tags;`;
}
