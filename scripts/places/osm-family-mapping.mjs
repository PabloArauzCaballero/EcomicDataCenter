/**
 * Maps a raw OpenStreetMap tag pair to a family code of the project's own
 * catalogue (`scripts/places/catalogue/bolivia-place-families.json`).
 *
 * Conservative on purpose: OSM tags a shop or amenity with one or two keys,
 * the catalogue defines 2.330 families down to the cuisine of a restaurant.
 * A tag only appears here when the two mean the same thing without guessing
 * — `shop=pharmacy` is a pharmacy everywhere, `amenity=restaurant` with no
 * `cuisine` tag is the generic `RESTAURANTE`, never a specific cuisine code.
 * Every tag this table does not cover, and every generic tag it deliberately
 * refuses to narrow, goes to `OTRA_ENTIDAD` upstream — counted, not invented.
 */

/** `osmKey=osmValue` → family code, verified to exist in the catalogue at load time. */
export const OSM_TAG_TO_FAMILY = {
  'shop=pharmacy': 'FARMACIA',
  'shop=supermarket': 'SUPERMERCADO',
  'shop=convenience': 'MINIMARKET',
  'shop=kiosk': 'MINIMARKET',
  'shop=general': 'ABARROTES',
  'shop=grocery': 'ABARROTES',
  'shop=hardware': 'FERRETERIA',
  'shop=doityourself': 'FERRETERIA',
  'shop=butcher': 'CARNICERIA',
  'shop=greengrocer': 'FRUTAS_VERDURAS',
  'shop=bakery': 'PANADERIA_PASTELERIA',
  'shop=confectionery': 'PANADERIA_PASTELERIA',
  'shop=ice_cream': 'HELADERIA',
  'shop=alcohol': 'BEBIDAS',
  'shop=beverages': 'BEBIDAS',
  'shop=clothes': 'ROPA_MODA',
  'shop=fashion': 'ROPA_MODA',
  'shop=shoes': 'CALZADOS',
  'shop=jewelry': 'JOYERIA_RELOJERIA',
  'shop=watches': 'JOYERIA_RELOJERIA',
  'shop=optician': 'OPTICA',
  'shop=books': 'LIBRERIA',
  'shop=stationery': 'IMPRENTA_FOTOCOPIAS',
  'shop=copyshop': 'IMPRENTA_FOTOCOPIAS',
  'shop=toys': 'JUGUETERIA',
  'shop=electronics': 'ELECTRODOMESTICOS',
  'shop=appliance': 'ELECTRODOMESTICOS',
  'shop=mobile_phone': 'TIENDA_OPERADOR_TELECOM',
  'shop=computer': 'COMPUTACION',
  'shop=pet': 'TIENDA_MASCOTAS',
  'shop=florist': 'FLORERIA',
  'shop=car_repair': 'TALLER_MECANICO',
  'shop=tyres': 'LLANTERIA',
  'shop=car_wash': 'LAVADERO_AUTOS',
  'shop=laundry': 'LAVANDERIA_TINTORERIA',
  'shop=dry_cleaning': 'LAVANDERIA_TINTORERIA',
  'shop=hairdresser': 'PELUQUERIA',
  'shop=beauty': 'PELUQUERIA',
  'shop=department_store': 'TIENDA_DEPARTAMENTOS',
  'shop=mall': 'CENTRO_COMERCIAL',
  'shop=second_hand': 'TIENDA_SEGUNDA_MANO',
  'shop=bicycle': 'BICICLETAS_TIENDA',
  'shop=sports': 'DEPORTES_ARTICULOS',
  'shop=variety_store': 'TIENDA_DEPARTAMENTOS',
  'shop=gas': 'GLP_COMBUSTIBLES',
  'amenity=pharmacy': 'FARMACIA',
  'amenity=hospital': 'HOSPITAL',
  'amenity=clinic': 'CLINICA',
  'amenity=doctors': 'CLINICA',
  'amenity=dentist': 'ODONTOLOGIA',
  'amenity=veterinary': 'ESTABLECIMIENTO_VETERINARIO_RURAL',
  'amenity=restaurant': 'RESTAURANTE',
  'amenity=fast_food': 'RESTAURANTE',
  'amenity=cafe': 'CAFE',
  'amenity=bar': 'BAR_PUB',
  'amenity=pub': 'BAR_PUB',
  'amenity=fuel': 'GLP_COMBUSTIBLES',
  'amenity=bank': 'BANCO',
  'amenity=school': 'COLEGIO_ESCUELA',
  'amenity=kindergarten': 'GUARDERIA',
  'amenity=college': 'INSTITUTO_TECNICO',
  'amenity=university': 'UNIVERSIDAD',
  'amenity=library': 'BIBLIOTECA',
  'amenity=place_of_worship': 'IGLESIA_TEMPLO',
  'amenity=cinema': 'CINE',
  'amenity=theatre': 'TEATRO',
  'amenity=gym': 'GIMNASIO',
  'amenity=police': 'POLICIA',
  'amenity=fire_station': 'BOMBEROS',
  'amenity=townhall': 'ALCALDIA_SUBALCALDIA',
  'amenity=courthouse': 'JUZGADO_TRIBUNAL',
  'amenity=driving_school': 'AUTOESCUELA',
  'amenity=car_wash': 'LAVADERO_AUTOS',
  'amenity=car_rental': 'EMPRESA_TRANSPORTE_PASAJEROS',
  'amenity=taxi': 'TAXI',
  'amenity=bus_station': 'TERMINAL_BUS',
  'amenity=parking': 'ESTACIONAMIENTO',
  'amenity=marketplace': 'MERCADO',
  'amenity=events_venue': 'GALERIA_ARTE',
  'office=lawyer': 'ABOGADOS_NOTARIA',
  'office=notary': 'ABOGADOS_NOTARIA',
  'office=insurance': 'ASEGURADORA',
  'office=government': 'OFICINA_GOBIERNO',
  'office=estate_agent': 'INMOBILIARIA',
  'office=architect': 'ARQUITECTURA_INGENIERIA',
  'office=engineer': 'ARQUITECTURA_INGENIERIA',
  'office=it': 'SOFTWARE_TI',
  'office=advertising_agency': 'PUBLICIDAD_MARKETING',
  'office=travel_agent': 'AGENCIA_VIAJES',
  'office=logistics': 'LOGISTICA_TRANSPORTE_CARGA',
  'craft=carpenter': 'CHAPERIA_PINTURA',
  'craft=electrician': 'CHAPERIA_PINTURA',
  'craft=tailor': 'SASTRERIA_COSTURA',
  'craft=photographer': 'FOTOGRAFIA',
  'craft=shoemaker': 'ZAPATERO',
  'healthcare=pharmacy': 'FARMACIA',
  'healthcare=hospital': 'HOSPITAL',
  'healthcare=clinic': 'CLINICA',
  'healthcare=dentist': 'ODONTOLOGIA',
  'healthcare=centre': 'CENTRO_SALUD',
  'tourism=hotel': 'HOTEL',
  'tourism=guest_house': 'APART_HOTEL_ALOJAMIENTO',
  'tourism=hostel': 'APART_HOTEL_ALOJAMIENTO',
  'tourism=motel': 'HOTEL',
  'tourism=museum': 'MUSEO',
  'tourism=travel_agency': 'AGENCIA_VIAJES',
  'leisure=fitness_centre': 'GIMNASIO',
  'leisure=sports_centre': 'CENTRO_DEPORTIVO',
  'leisure=swimming_pool': 'PISCINA',
};

/**
 * The OSM key considered for each element, in priority order.
 *
 * A node can carry several of these at once (a hotel with a restaurant
 * inside); the first key present decides the family, because the request
 * that builds the Overpass query already asked for one primary tag per
 * element and this keeps the two consistent.
 */
export const CLASSIFYING_KEYS = ['shop', 'amenity', 'office', 'craft', 'healthcare', 'tourism', 'leisure'];

/**
 * The family this element's tags resolve to, or null when nothing here is a
 * confident match — a caller must then file it as `OTRA_ENTIDAD`, never guess.
 */
export function classifyOsmTags(tags) {
  for (const key of CLASSIFYING_KEYS) {
    const value = tags?.[key];
    if (!value) continue;
    const pairKey = `${key}=${value}`;
    const code = OSM_TAG_TO_FAMILY[pairKey];
    if (code) return { code, tag: pairKey };
    return { code: null, tag: pairKey };
  }
  return null;
}
