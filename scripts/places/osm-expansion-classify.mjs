/**
 * La tabla que decide la familia de un objeto de OpenStreetMap por sus
 * etiquetas. Ver `read-osm-expansion.mjs` para las reglas que la rodean.
 */

/** La primera etiqueta que casa, en el orden en que se escribe la tabla. */
function tagged(tags, key, values) {
  const value = tags[key];
  if (value === undefined) return null;
  if (values === null || values.includes(value)) return `${key}=${value}`;
  return null;
}

export function plain(text) {
  return (text ?? '').normalize('NFD').replace(/[̀-ͯ]/gu, '').toLowerCase();
}

/*
 * La denominacion de un templo, a la familia del catalogo de 2.330 que la
 * nombra. Lo que no esta aqui cae en IGLESIA_TEMPLO, que es la familia padre.
 */
const WORSHIP_BY_DENOMINATION = new Map([
  ['catholic', 'OV_ROMAN_CATHOLIC_PLACE_OF_WORSHIP'],
  ['roman_catholic', 'OV_ROMAN_CATHOLIC_PLACE_OF_WORSHIP'],
  ['seventh_day_adventist', 'OV_ADVENTIST_PLACE_OF_WORSHIP'],
  ['adventist', 'OV_ADVENTIST_PLACE_OF_WORSHIP'],
  ['jehovahs_witness', 'OV_JEHOVAHS_WITNESS_PLACE_OF_WORSHIP'],
  ['mormon', 'OV_MORMON_PLACE_OF_WORSHIP'],
  ['latter_day_saints', 'OV_MORMON_PLACE_OF_WORSHIP'],
  ['baptist', 'OV_BAPTIST_PLACE_OF_WORSHIP'],
  ['methodist', 'OV_METHODIST_PLACE_OF_WORSHIP'],
  ['pentecostal', 'OV_PENTECOSTAL_PLACE_OF_WORSHIP'],
  ['assemblies_of_god', 'OV_PENTECOSTAL_PLACE_OF_WORSHIP'],
  ['lutheran', 'OV_LUTHERAN_PLACE_OF_WORSHIP'],
  ['evangelical', 'OV_PROTESTANT_PLACE_OF_WORSHIP'],
  ['protestant', 'OV_PROTESTANT_PLACE_OF_WORSHIP'],
  ['mennonite', 'OV_ANABAPTIST_PLACE_OF_WORSHIP'],
]);
const WORSHIP_BY_RELIGION = new Map([
  ['muslim', 'OV_MUSLIM_PLACE_OF_WORSHIP'],
  ['buddhist', 'OV_BUDDHIST_PLACE_OF_WORSHIP'],
  ['jewish', 'OV_JEWISH_PLACE_OF_WORSHIP'],
  ['hindu', 'OV_HINDU_PLACE_OF_WORSHIP'],
]);

function worshipFamily(tags) {
  const denomination = WORSHIP_BY_DENOMINATION.get(tags.denomination);
  if (denomination) return denomination;
  return WORSHIP_BY_RELIGION.get(tags.religion) ?? 'IGLESIA_TEMPLO';
}

/*
 * Tres familias se deciden por el nombre, y solo esas tres, porque la etiqueta
 * no alcanza: `office=cooperative` cubre igual a una cooperativa minera, a una
 * de ahorro y a la que reparte el agua, y en Bolivia las tres son grandes. El
 * nombre lo escribio el mapeador y dice que clase de cooperativa es; si no lo
 * dice, la fila queda en la familia que no afirma ninguna.
 */
function cooperativeFamily(name) {
  const text = plain(name);
  if (/\bminer[ao]s?\b/u.test(text)) return 'COOPERATIVA_MINERA';
  if (/ahorro|credito/u.test(text)) return 'COOPERATIVA_FINANCIERA';
  return 'OFICINA_COOPERATIVA';
}

function industrialAreaFamily(name) {
  return /parque industrial/u.test(plain(name)) ? 'PARQUE_INDUSTRIAL' : 'PREDIO_INDUSTRIAL';
}

/** `industrial=*`, valor a valor. Lo que no se nombra aqui es un predio. */
const INDUSTRIAL_BY_VALUE = new Map([
  ['mine', 'MINA'],
  ['sawmill', 'OV_SAWMILL'],
  ['brickyard', 'LADRILLERA'],
  ['slaughterhouse', 'MATADERO'],
  ['factory', 'FABRICA_PLANTA'],
  ['food_industry', 'PLANTA_ALIMENTOS'],
  ['dairy', 'PLANTA_ALIMENTOS'],
  ['sugar_mill', 'INGENIO_AZUCARERO'],
  ['oil', 'PLANTA_HIDROCARBUROS'],
  ['gas', 'PLANTA_HIDROCARBUROS'],
  ['refinery', 'PLANTA_HIDROCARBUROS'],
  ['oil_mill', 'PLANTA_ALIMENTOS'],
  ['grinding_mill', 'OV_MILL'],
  ['brewery', 'CERVECERIA_PLANTA'],
  ['concrete_plant', 'PLANTA_CEMENTO_HORMIGON'],
  ['cement', 'PLANTA_CEMENTO_HORMIGON'],
  ['asphalt', 'PLANTA_CEMENTO_HORMIGON'],
]);
/*
 * Depositos y almacenes quedan fuera aunque OpenStreetMap los etiquete como
 * industria: son logistica, y la logistica la esta cargando otra rama.
 */
export const INDUSTRIAL_SKIPPED = new Set([
  'warehouse',
  'depot',
  'distributor',
  'port',
  'logistics',
]);

const TOURISM_FAMILY = new Map([
  ['hotel', 'HOTEL'],
  ['hostel', 'HOSTAL_HOSTEL'],
  ['guest_house', 'OV_GUEST_HOUSE'],
  ['motel', 'MOTEL'],
  ['apartment', 'APART_HOTEL_ALOJAMIENTO'],
  ['camp_site', 'OV_CAMPGROUND'],
  ['alpine_hut', 'REFUGIO_MONTANA'],
  ['wilderness_hut', 'REFUGIO_MONTANA'],
  ['museum', 'MUSEO'],
  ['gallery', 'GALERIA_ARTE'],
  ['attraction', 'ATRACTIVO_TURISTICO'],
  ['viewpoint', 'OV_SCENIC_VIEWPOINT'],
  ['artwork', 'OBRA_ARTE_PUBLICO'],
  ['zoo', 'ZOO_ACUARIO'],
  ['theme_park', 'PARQUE_TEMATICO'],
]);

const HISTORIC_FAMILY = new Map([
  ['monument', 'OV_MONUMENT'],
  ['memorial', 'OV_MEMORIAL_SITE'],
  ['ruins', 'OV_RUIN'],
  ['archaeological_site', 'SITIO_ARQUEOLOGICO'],
  ['castle', 'OV_HISTORIC_SITE'],
  ['mine', 'MINA_HISTORICA'],
]);

const LEISURE_FAMILY = new Map([
  ['sports_centre', 'CENTRO_DEPORTIVO'],
  ['stadium', 'ESTADIO'],
  ['pitch', 'CANCHA'],
  ['swimming_pool', 'PISCINA'],
  ['golf_course', 'CAMPO_GOLF'],
  ['fitness_centre', 'GIMNASIO'],
  ['track', 'PISTA_DEPORTIVA'],
]);

const AMENITY_FAMILY = new Map([
  ['bureau_de_change', 'CASA_CAMBIO'],
  ['money_transfer', 'REMESAS_PAGOS'],
  ['payment_centre', 'REMESAS_PAGOS'],
  ['townhall', 'ALCALDIA_SUBALCALDIA'],
  ['courthouse', 'JUZGADO_TRIBUNAL'],
  ['police', 'POLICIA'],
  ['fire_station', 'BOMBEROS'],
  ['monastery', 'CONVENTO_MONASTERIO'],
  ['theatre', 'TEATRO'],
  ['arts_centre', 'CENTRO_CULTURAL'],
  ['community_centre', 'CENTRO_COMUNITARIO'],
  ['marketplace', 'MERCADO'],
]);

const LANDUSE_FAMILY = new Map([
  ['farmland', 'CULTIVO_AGRICOLA'],
  ['orchard', 'HUERTO_FRUTAL'],
  ['vineyard', 'VINEDO'],
  ['greenhouse_horticulture', 'INVERNADERO'],
  ['aquaculture', 'OV_FISH_FARM'],
  ['animal_keeping', 'CRIADERO_ANIMALES'],
  ['quarry', 'CANTERA_ARIDOS'],
]);

/** Un nombre que es solo el numero de una parcela o de un lote. */
export const CADASTRAL_PARCEL =
  /(?:^|[\s-])(?:parc|parcela|lote|predio)[\s.-]*n?[°º.]?\s*\d+\s*$/iu;

/** Los usos de suelo, que son areas y no locales. */
export const AREA_ONLY = new Set(['landuse', 'place']);

/**
 * La familia de un objeto, y la etiqueta de la que salio.
 *
 * El orden importa y es de lo mas especifico a lo mas general: una iglesia
 * historica con `amenity=place_of_worship` es un templo antes que un
 * monumento, y una cantera con `industrial=mine` es una mina antes que un uso
 * de suelo. Devuelve null cuando nada casa, o cuando lo que casa es de otra
 * rama; la fila entonces no entra.
 */
export function classifyOsm(tags) {
  const name = tags.name ?? '';
  let key;

  if ((key = tagged(tags, 'amenity', ['place_of_worship']))) {
    return { family: worshipFamily(tags), key };
  }
  if ((key = tagged(tags, 'amenity', [...AMENITY_FAMILY.keys()]))) {
    return { family: AMENITY_FAMILY.get(tags.amenity), key };
  }
  if ((key = tagged(tags, 'office', ['cooperative']))) {
    return { family: cooperativeFamily(name), key };
  }
  if ((key = tagged(tags, 'office', ['financial']))) {
    return {
      family: /cooperativa/u.test(plain(name)) ? 'COOPERATIVA_FINANCIERA' : 'OV_FINANCIAL_SERVICE',
      key,
    };
  }
  const offices = new Map([
    ['insurance', 'ASEGURADORA'],
    ['financial_advisor', 'OV_FINANCIAL_ADVISING'],
    ['telecommunication', 'TELECOM_OPERADOR'],
    ['government', 'OFICINA_GOBIERNO'],
  ]);
  if ((key = tagged(tags, 'office', [...offices.keys()]))) {
    return { family: offices.get(tags.office), key };
  }
  const shops = new Map([
    ['agrarian', 'AGROPECUARIA_INSUMOS'],
    ['farm', 'VENTA_DIRECTA_PRODUCTOR'],
    ['mobile_phone', 'CELULARES_TELEFONIA'],
    ['telecommunication', 'TIENDA_OPERADOR_TELECOM'],
  ]);
  if ((key = tagged(tags, 'shop', [...shops.keys()]))) {
    return { family: shops.get(tags.shop), key };
  }
  const crafts = new Map([
    ['agricultural_engines', 'OV_FARM_EQUIPMENT_REPAIR_SERVICE'],
    ['beekeeper', 'APICULTURA'],
    ['brewery', 'CERVECERIA_PLANTA'],
    ['winery', 'BODEGA_DESTILERIA'],
    ['distillery', 'BODEGA_DESTILERIA'],
    ['sawmill', 'OV_SAWMILL'],
  ]);
  if ((key = tagged(tags, 'craft', [...crafts.keys()]))) {
    return { family: crafts.get(tags.craft), key };
  }
  if ((key = tagged(tags, 'industrial', null))) {
    if (INDUSTRIAL_SKIPPED.has(tags.industrial)) return null;
    return { family: INDUSTRIAL_BY_VALUE.get(tags.industrial) ?? 'PREDIO_INDUSTRIAL', key };
  }
  if ((key = tagged(tags, 'man_made', ['mineshaft', 'adit']))) {
    return { family: 'BOCAMINA', key };
  }
  if ((key = tagged(tags, 'man_made', ['works']))) return { family: 'FABRICA_PLANTA', key };
  if ((key = tagged(tags, 'man_made', ['silo']))) return { family: 'SILO_ACOPIO', key };
  if ((key = tagged(tags, 'tourism', [...TOURISM_FAMILY.keys()]))) {
    return { family: TOURISM_FAMILY.get(tags.tourism), key };
  }
  // Un cartel o un poste de senales tambien es `tourism=information`; solo la
  // oficina es un lugar donde atiende alguien.
  if (tags.tourism === 'information' && tags.information === 'office') {
    return { family: 'INFORMACION_TURISTICA', key: 'tourism=information' };
  }
  if ((key = tagged(tags, 'historic', [...HISTORIC_FAMILY.keys()]))) {
    return { family: HISTORIC_FAMILY.get(tags.historic), key };
  }
  if ((key = tagged(tags, 'leisure', [...LEISURE_FAMILY.keys()]))) {
    return { family: LEISURE_FAMILY.get(tags.leisure), key };
  }
  if ((key = tagged(tags, 'club', ['sport']))) return { family: 'CLUB_DEPORTIVO', key };
  if ((key = tagged(tags, 'landuse', ['industrial']))) {
    return { family: industrialAreaFamily(name), key };
  }
  if ((key = tagged(tags, 'landuse', [...LANDUSE_FAMILY.keys()]))) {
    return { family: LANDUSE_FAMILY.get(tags.landuse), key };
  }
  if ((key = tagged(tags, 'place', ['farm']))) return { family: 'ESTANCIA_FINCA', key };
  return null;
}
