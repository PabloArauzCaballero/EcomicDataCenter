/**
 * La tabla que decide la familia de un local comercial o de servicios de
 * Santa Cruz por sus etiquetas de OpenStreetMap. Ver `read-scz-enrichment-osm.mjs`
 * para las reglas que la rodean.
 *
 * Deliberadamente conservadora: solo entra una pareja `clave=valor` cuando
 * las dos significan lo mismo sin adivinar. `amenity=restaurant` sin
 * `cuisine` es el genérico `RESTAURANTE`, nunca una cocina concreta. Lo que
 * esta tabla no reconoce devuelve `null`, y quien la llama descarta la fila
 * en vez de archivarla en una familia genérica — es la regla que el encargo
 * pidió explícitamente: mejor no sumar un lugar que sumarlo mal clasificado.
 */

/** La primera etiqueta que casa, con la pareja `clave=valor` que decidió. */
function tagged(tags, key, values) {
  const value = tags[key];
  if (value === undefined) return null;
  if (values === null || values.includes(value)) return `${key}=${value}`;
  return null;
}

const SHOP_FAMILY = new Map([
  ['supermarket', 'SUPERMERCADO'],
  ['convenience', 'MINIMARKET'],
  ['kiosk', 'MINIMARKET'],
  ['general', 'ABARROTES'],
  ['grocery', 'ABARROTES'],
  ['hardware', 'FERRETERIA'],
  ['doityourself', 'FERRETERIA'],
  ['butcher', 'CARNICERIA'],
  ['greengrocer', 'FRUTAS_VERDURAS'],
  ['bakery', 'PANADERIA_PASTELERIA'],
  ['confectionery', 'PANADERIA_PASTELERIA'],
  ['ice_cream', 'HELADERIA'],
  ['alcohol', 'BEBIDAS'],
  ['beverages', 'BEBIDAS'],
  ['clothes', 'ROPA_MODA'],
  ['fashion', 'ROPA_MODA'],
  ['shoes', 'CALZADOS'],
  ['jewelry', 'JOYERIA_RELOJERIA'],
  ['watches', 'JOYERIA_RELOJERIA'],
  ['optician', 'OPTICA'],
  ['books', 'LIBRERIA'],
  ['stationery', 'IMPRENTA_FOTOCOPIAS'],
  ['copyshop', 'IMPRENTA_FOTOCOPIAS'],
  ['toys', 'JUGUETERIA'],
  ['electronics', 'ELECTRODOMESTICOS'],
  ['appliance', 'ELECTRODOMESTICOS'],
  ['computer', 'COMPUTACION'],
  ['pet', 'TIENDA_MASCOTAS'],
  ['florist', 'FLORERIA'],
  ['department_store', 'TIENDA_DEPARTAMENTOS'],
  ['mall', 'CENTRO_COMERCIAL'],
  ['second_hand', 'TIENDA_SEGUNDA_MANO'],
  ['bicycle', 'BICICLETAS_TIENDA'],
  ['sports', 'DEPORTES_ARTICULOS'],
  ['variety_store', 'TIENDA_DEPARTAMENTOS'],
  ['car_repair', 'TALLER_MECANICO'],
  ['tyres', 'LLANTERIA'],
  ['car_wash', 'LAVADERO_AUTOS'],
  ['laundry', 'LAVANDERIA_TINTORERIA'],
  ['dry_cleaning', 'LAVANDERIA_TINTORERIA'],
  ['hairdresser', 'PELUQUERIA'],
  ['beauty', 'PELUQUERIA'],
  ['houseware', 'OV_HOME_GOODS_STORE'],
  ['garden_centre', 'VIVERO_JARDINERIA'],
  ['musical_instrument', 'OV_MUSICAL_INSTRUMENT_STORE'],
  ['art', 'GALERIA_ARTE'],
  ['antiques', 'OV_ANTIQUE_STORE'],
  ['gift', 'REGALOS'],
  ['bag', 'OV_LEATHER_GOODS_STORE'],
  ['leather', 'OV_LEATHER_GOODS_STORE'],
  ['deli', 'OV_DELICATESSEN'],
  ['seafood', 'OV_SEAFOOD_MARKET'],
  ['water', 'OV_WATER_STORE'],
  ['newsagent', 'OV_NEWSPAPER_AND_MAGAZINES_STORE'],
  ['tobacco', 'OV_TOBACCO_SHOP'],
  ['funeral_directors', 'FUNERARIA'],
  ['pawnbroker', 'CASA_EMPENO'],
]);

const OFFICE_FAMILY = new Map([
  ['lawyer', 'ABOGADOS_NOTARIA'],
  ['notary', 'ABOGADOS_NOTARIA'],
  ['estate_agent', 'INMOBILIARIA'],
  ['architect', 'ARQUITECTURA_INGENIERIA'],
  ['engineer', 'ARQUITECTURA_INGENIERIA'],
  ['it', 'SOFTWARE_TI'],
  ['advertising_agency', 'PUBLICIDAD_MARKETING'],
  ['travel_agent', 'AGENCIA_VIAJES'],
  ['logistics', 'LOGISTICA_TRANSPORTE_CARGA'],
  ['consulting', 'CONSULTORIA'],
  ['ngo', 'ONG_FUNDACION'],
]);

const CRAFT_FAMILY = new Map([
  ['electrician', 'SERVICIO_ELECTRICISTA'],
  ['plumber', 'SERVICIO_PLOMERIA'],
  ['locksmith', 'CERRAJERIA'],
  ['tailor', 'SASTRERIA_COSTURA'],
  ['photographer', 'FOTOGRAFIA'],
  ['shoemaker', 'ZAPATERO'],
]);

const AMENITY_FAMILY = new Map([
  ['veterinary', 'VETERINARIA'],
  ['driving_school', 'AUTOESCUELA'],
  ['casino', 'CASINO_APUESTAS'],
  ['cinema', 'CINE'],
  ['bar', 'BAR_PUB'],
  ['pub', 'BAR_PUB'],
  ['nightclub', 'DISCOTECA_NIGHTCLUB'],
]);

/**
 * `cuisine` (u.a. `restaurant`/`fast_food`), a la familia específica que el
 * catálogo de 2.371 nombra. Lo que no está aquí cae en el genérico de la
 * familia que llamó (`RESTAURANTE` o `COMIDA_RAPIDA`), nunca en una cocina
 * inventada. Un `cuisine` con varios valores (`pizza;pasta`) prueba cada uno
 * en el orden que trae la etiqueta y se queda con el primero que reconoce.
 */
const CUISINE_FAMILY = new Map([
  ['pizza', 'OV_PIZZA_RESTAURANT'],
  ['burger', 'OV_BURGER_RESTAURANT'],
  ['chicken', 'OV_CHICKEN_RESTAURANT'],
  ['sandwich', 'OV_SANDWICH_SHOP'],
  ['sushi', 'OV_SUSHI_RESTAURANT'],
  ['vegetarian', 'OV_VEGETARIAN_RESTAURANT'],
  ['vegan', 'OV_VEGAN_RESTAURANT'],
  ['steak_house', 'OV_STEAKHOUSE'],
  ['barbecue', 'OV_BARBECUE_RESTAURANT'],
  ['chinese', 'OV_CHINESE_RESTAURANT'],
  ['italian', 'OV_ITALIAN_RESTAURANT'],
  ['japanese', 'OV_JAPANESE_RESTAURANT'],
  ['mexican', 'OV_MEXICAN_RESTAURANT'],
  ['peruvian', 'OV_PERUVIAN_RESTAURANT'],
  ['seafood', 'OV_SEAFOOD_RESTAURANT'],
  ['latin_american', 'OV_LATIN_AMERICAN_RESTAURANT'],
  ['spanish', 'OV_SPANISH_RESTAURANT'],
  ['buffet', 'OV_BUFFET_RESTAURANT'],
  ['regional', 'OV_BOLIVIAN_RESTAURANT'],
  ['bolivian', 'OV_BOLIVIAN_RESTAURANT'],
  ['local', 'OV_BOLIVIAN_RESTAURANT'],
  ['thai', 'OV_THAI_RESTAURANT'],
  ['indian', 'OV_INDIAN_RESTAURANT'],
  ['arab', 'OV_ARABIAN_RESTAURANT'],
  ['arabian', 'OV_ARABIAN_RESTAURANT'],
  ['lebanese', 'OV_ARABIAN_RESTAURANT'],
  ['asian', 'OV_ASIAN_RESTAURANT'],
]);

function cuisineFamily(tags) {
  const raw = (tags.cuisine ?? '').trim();
  if (raw.length === 0) return null;
  for (const value of raw.split(';')) {
    const family = CUISINE_FAMILY.get(value.trim().toLowerCase());
    if (family) return family;
  }
  return null;
}

/**
 * La familia de un objeto, y la etiqueta de la que salió.
 *
 * `shop` primero, porque un local puede llevar `shop` y `amenity` a la vez
 * (una panadería con `amenity=cafe` adentro): la actividad que el mapeador
 * escribió en `shop` es la más específica de las dos. Los restaurantes y
 * comida rápida prueban `cuisine` antes de caer en el genérico.
 */
export function classifySczCommerce(tags) {
  let key = tagged(tags, 'shop', [...SHOP_FAMILY.keys()]);
  if (key) return { family: SHOP_FAMILY.get(tags.shop), key };

  if ((key = tagged(tags, 'amenity', ['restaurant', 'fast_food']))) {
    const cuisine = cuisineFamily(tags);
    if (cuisine) return { family: cuisine, key: `${key}+cuisine=${tags.cuisine}` };
    return { family: tags.amenity === 'restaurant' ? 'RESTAURANTE' : 'COMIDA_RAPIDA', key };
  }
  if ((key = tagged(tags, 'amenity', ['cafe']))) return { family: 'CAFE', key };
  if ((key = tagged(tags, 'amenity', [...AMENITY_FAMILY.keys()]))) {
    return { family: AMENITY_FAMILY.get(tags.amenity), key };
  }
  if ((key = tagged(tags, 'office', [...OFFICE_FAMILY.keys()]))) {
    return { family: OFFICE_FAMILY.get(tags.office), key };
  }
  if ((key = tagged(tags, 'craft', [...CRAFT_FAMILY.keys()]))) {
    return { family: CRAFT_FAMILY.get(tags.craft), key };
  }
  return null;
}
