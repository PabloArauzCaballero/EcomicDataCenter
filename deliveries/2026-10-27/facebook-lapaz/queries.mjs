/**
 * Consultas de descubrimiento: rubro × lugar del departamento de La Paz.
 *
 * Se buscan en Yahoo con «site:facebook.com <rubro> <lugar>» (Yahoo sí respeta
 * `site:`; Bing devolvía resultados envenenados ese día, ver README). Yahoo da una
 * sola página de 7 resultados a un robot —la segunda redirige a `_bv/v.gif`—, así
 * que la cobertura sale de multiplicar consultas, no de paginar.
 */

export const RUBROS = [
  'restaurante', 'polleria', 'salteñeria', 'cafeteria', 'panaderia', 'pasteleria', 'heladeria',
  'pizzeria', 'hamburguesas', 'comida rapida', 'pensión almuerzo', 'anticucheria', 'cevicheria',
  'chicharroneria', 'pollos a la brasa', 'karaoke', 'discoteca', 'farmacia', 'ferreteria',
  'tienda de ropa', 'boutique', 'zapateria', 'peluqueria', 'barberia', 'salon de belleza', 'spa',
  'gimnasio', 'clinica', 'consultorio medico', 'consultorio dental', 'odontologia', 'laboratorio clinico',
  'optica', 'fisioterapia', 'psicologo', 'taller mecanico', 'lubricentro', 'llanteria', 'repuestos automotriz',
  'lavadero de autos', 'hotel', 'hostal', 'alojamiento', 'agencia de viajes', 'libreria', 'papeleria',
  'celulares', 'tienda de computadoras', 'electrodomesticos', 'supermercado', 'minimarket', 'muebleria',
  'carpinteria', 'veterinaria', 'pet shop', 'colegio privado', 'unidad educativa', 'instituto',
  'academia', 'guarderia', 'kinder', 'inmobiliaria', 'imprenta', 'publicidad', 'distribuidora',
  'importadora', 'constructora', 'materiales de construccion', 'vidrieria', 'cerrajeria',
  'electricista', 'estudio juridico abogados', 'contador auditoria', 'notaria', 'floreria',
  'joyeria', 'regalos', 'juguete', 'cotillon', 'tienda deportiva', 'bicicletas', 'motos',
  'concesionario autos', 'transporte mudanza', 'courier', 'radio taxi', 'lavanderia', 'sastreria',
  'costura', 'fotografia estudio', 'salon de eventos', 'catering', 'licoreria', 'carniceria',
  'fruteria', 'mercado', 'artesanias', 'textiles', 'cooperativa', 'fabrica', 'escuela de conduccion',
  'cafe internet', 'marmoleria', 'pintureria', 'cosmeticos', 'perfumeria', 'naturista', 'tienda de bebes',
];

export const CIUDADES = ['La Paz Bolivia', 'El Alto Bolivia'];

/** Zonas donde se cruzan los rubros más densos. */
export const ZONAS = [
  'Sopocachi', 'Miraflores La Paz', 'Calacoto', 'Achumani', 'San Miguel La Paz', 'Centro La Paz',
  'Villa Fatima', 'Obrajes', 'Irpavi', 'Cota Cota', 'San Pedro La Paz', 'Zona Sur La Paz',
  'Max Paredes', 'Gran Poder La Paz', 'Villa Copacabana La Paz', 'Pampahasi', 'Tembladerani',
  'Alto Obrajes', 'Los Pinos La Paz', 'Chasquipampa', 'Mallasa', 'Seguencoma', 'Bolognia La Paz',
  'Ceja El Alto', '16 de Julio El Alto', 'Ciudad Satelite El Alto', 'Senkata', 'Villa Adela',
  'Rio Seco El Alto', 'Villa Dolores El Alto', 'Ballivian El Alto', 'Villa Bolivar El Alto',
  'Rosas Pampa', 'Alto Lima El Alto', 'Villa Tunari El Alto', 'Villa Ingenio El Alto', 'Santiago II El Alto',
];

/** Rubros que se cruzan con cada zona (los de más locales a pie de calle). */
export const RUBROS_ZONA = [
  'restaurante', 'polleria', 'salteñeria', 'cafeteria', 'panaderia', 'farmacia', 'ferreteria',
  'tienda de ropa', 'peluqueria', 'gimnasio', 'clinica', 'consultorio', 'taller mecanico',
  'hotel', 'libreria', 'celulares', 'supermercado', 'veterinaria', 'colegio', 'tienda',
];

export const MUNICIPIOS = [
  'Viacha', 'Achocalla', 'Mecapaca', 'Palca', 'Laja', 'Pucarani', 'Copacabana Bolivia', 'Coroico',
  'Caranavi', 'Chulumani', 'Coripata', 'Irupana', 'Achacachi', 'Sorata', 'Guanay', 'Rurrenabaque',
  'San Buenaventura Bolivia', 'Apolo Bolivia', 'Patacamaya', 'Sica Sica', 'Desaguadero Bolivia',
  'Tiwanaku', 'Batallas', 'Palos Blancos', 'Yanacachi', 'Quime', 'Luribay', 'Colquiri', 'Caquiaviri',
  'Corocoro', 'Guaqui', 'Ixiamas', 'La Asunta', 'Teoponte', 'Mapiri', 'Charazani', 'Escoma',
  'Puerto Acosta', 'Tipuani', 'Inquisivi', 'Calamarca', 'Ayo Ayo', 'Huarina', 'Tiquina',
];

export const RUBROS_MUNICIPIO = [
  'restaurante', 'hotel', 'alojamiento', 'farmacia', 'tienda', 'ferreteria', 'panaderia',
  'clinica', 'colegio', 'taller', 'comercial', 'turismo',
];

export function buildQueries() {
  const out = [];
  const add = (q) => out.push(`site:facebook.com ${q}`);
  for (const c of CIUDADES) for (const r of RUBROS) add(`${r} ${c}`);
  for (const z of ZONAS) for (const r of RUBROS_ZONA) add(`${r} ${z}`);
  for (const m of MUNICIPIOS) for (const r of RUBROS_MUNICIPIO) add(`${r} ${m} La Paz`);
  return [...new Set(out)];
}
