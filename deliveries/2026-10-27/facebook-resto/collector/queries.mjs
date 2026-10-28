// Rubros × ciudades. Las capitales llevan la lista completa (3 páginas de resultados);
// las ciudades intermedias, la lista corta (2 páginas).
export const RUBROS = [
  'restaurante', 'pollería', 'salteñería', 'cafetería', 'panadería', 'pastelería', 'heladería', 'pizzería',
  'hamburguesería', 'comida rápida', 'churrasquería', 'pensión comida', 'juguería', 'comida típica',
  'farmacia', 'ferretería', 'tienda de ropa', 'boutique', 'zapatería', 'peluquería', 'barbería', 'salón de belleza',
  'spa', 'uñas manicure', 'gimnasio', 'clínica', 'consultorio médico', 'consultorio odontológico', 'laboratorio clínico',
  'óptica', 'taller mecánico', 'llantería', 'repuestos automotrices', 'lavadero de autos', 'hotel', 'hostal',
  'agencia de turismo', 'agencia de viajes', 'librería', 'papelería', 'imprenta', 'celulares', 'computadoras',
  'electrodomésticos', 'supermercado', 'minimarket', 'mueblería', 'carpintería', 'vidriería', 'veterinaria',
  'pet shop', 'colegio privado', 'instituto', 'academia', 'guardería', 'inmobiliaria', 'distribuidora',
  'constructora', 'materiales de construcción', 'cerrajería', 'lavandería', 'florería', 'joyería', 'bazar regalos',
  'juguetería', 'salón de eventos', 'catering', 'decoración de eventos', 'fotografía estudio', 'abogados estudio jurídico',
  'contador estudio contable', 'courier envíos', 'radio taxi', 'venta de autos', 'motos', 'artículos deportivos',
  'cancha sintética', 'tienda naturista', 'agropecuaria', 'carnicería', 'licorería', 'discoteca', 'karaoke',
  'cine', 'cosméticos', 'tienda de telas', 'mercería', 'electricidad materiales eléctricos', 'pinturas',
];

// Recortada a 26 el 27-oct (la RAM compartida dejaba ~2 consultas por minuto): se quitaron
// los rubros que en las primeras consultas no trajeron páginas nuevas en ciudades chicas.
export const RUBROS_CORTOS = [
  'restaurante', 'pollería', 'salteñería', 'cafetería', 'panadería', 'pizzería', 'farmacia',
  'ferretería', 'tienda de ropa', 'peluquería', 'gimnasio', 'clínica', 'taller mecánico',
  'hotel', 'hostal', 'agencia de turismo', 'librería', 'celulares', 'supermercado',
  'mueblería', 'veterinaria', 'colegio', 'instituto', 'distribuidora', 'materiales de construcción',
  'salón de eventos',
];

export const CIUDADES = [
  { name: 'Cochabamba', capital: true },
  { name: 'Sucre', capital: true },
  { name: 'Oruro', capital: true },
  { name: 'Potosí', capital: true },
  { name: 'Tarija', capital: true },
  { name: 'Trinidad', query: 'Trinidad Beni', capital: true },
  { name: 'Cobija', query: 'Cobija Pando', capital: true },
  { name: 'Quillacollo' },
  { name: 'Sacaba' },
  { name: 'Colcapirhua' },
  { name: 'Tiquipaya' },
  { name: 'Vinto', query: 'Vinto Cochabamba' },
  { name: 'Punata' },
  { name: 'Villa Tunari' },
  { name: 'Llallagua' },
  { name: 'Uyuni' },
  { name: 'Villazón' },
  { name: 'Tupiza' },
  { name: 'Huanuni' },
  { name: 'Challapata' },
  { name: 'Yacuiba' },
  { name: 'Villamontes' },
  { name: 'Bermejo' },
  { name: 'Monteagudo', query: 'Monteagudo Chuquisaca' },
  { name: 'Camargo', query: 'Camargo Chuquisaca' },
  { name: 'Riberalta' },
  { name: 'Guayaramerín' },
  { name: 'San Borja', query: 'San Borja Beni' },
  { name: 'Rurrenabaque' },
  { name: 'Aiquile' },
  { name: 'Shinahota' },
];
