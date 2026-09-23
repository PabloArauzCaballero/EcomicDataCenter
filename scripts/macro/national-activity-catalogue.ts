import { IMPUTED_BANK_SERVICES, branch, group, total } from './department-activity-catalogue';
import type { Activity } from './department-activity-catalogue';

/**
 * Las filas del cuadro nacional por actividad, y por qué hacen falta.
 *
 * Un departamento no se lee solo. «La minería es el 28 % de Potosí» dice una
 * cosa si en Bolivia es el 8 % y otra si es el 26 %, y sin la fila del país esa
 * comparación no existe. El INE publica el valor agregado bruto nacional por
 * actividad en su propio cuaderno —cuadros 5.01.01 y siguientes— y este archivo
 * es la lista de sus filas.
 *
 * **El cuadro nacional abre más que el departamental.** Donde el departamental
 * dice «Alimentos», el nacional separa carnes, lácteos, molinería, azúcar y
 * alimenticios diversos: treinta y cinco actividades contra las once del otro.
 * No es un desacuerdo entre los dos cuadros sino el mismo árbol con una rama
 * más abierta, y por eso las filas que coinciden llevan **el mismo `slug` que
 * su gemela departamental**: `PETROLEO_Y_GAS` es la misma actividad en Tarija y
 * en Bolivia, y sólo así el tablero puede ponerlas en un eje.
 *
 * **Las que no coinciden llevan su propio `slug` y su `parent`.** Las siete de
 * alimentación y bebida y las cinco que el cuadro departamental mete en «otras
 * manufacturas» se archivan tal como el INE las publica, colgando del grupo al
 * que pertenecen. Quien quiera la cifra nacional de un grupo suma sus ramas
 * —una suma de cifras publicadas, no una estimación— y quien quiera compararla
 * con la departamental la tiene fila a fila. Lo que **no** se hace es escribir
 * la suma en el corpus: un punto de este observatorio cita la celda de la que
 * salió, y una suma no tiene celda que citar.
 *
 * **El cuadro nacional no trae el producto a precios de mercado.** Empieza en
 * el valor agregado bruto a precios básicos, que es el total con el que suman
 * sus actividades y el mismo concepto que la tercera fila del departamental.
 * Los impuestos indirectos que separan uno de otro viven en otro cuadro y no se
 * echan de menos: lo que este capítulo compara es de qué vive cada economía, y
 * eso pasa por el valor agregado.
 */
export const NATIONAL_ACTIVITIES: readonly Activity[] = [
  total(
    'VALOR AGREGADO BRUTO (a precios básicos)',
    'PIB_BASICO',
    'Valor agregado bruto a precios básicos',
  ),

  branch(
    '1. PRODUCTOS AGRÍCOLAS NO INDUSTRIALES',
    'AGRICOLA_NO_INDUSTRIAL',
    'Productos agrícolas no industriales',
    'AGRICULTURA',
  ),
  branch(
    '2. PRODUCTOS AGRÍCOLAS INDUSTRIALES',
    'AGRICOLA_INDUSTRIAL',
    'Productos agrícolas industriales',
    'AGRICULTURA',
  ),
  branch('3. COCA', 'COCA', 'Coca', 'AGRICULTURA'),
  branch('4. PRODUCTOS PECUARIOS', 'PECUARIO', 'Productos pecuarios', 'AGRICULTURA'),
  branch(
    '5. SILVICULTURA, CAZA Y PESCA',
    'SILVICULTURA_CAZA_Y_PESCA',
    'Silvicultura, caza y pesca',
    'AGRICULTURA',
  ),

  branch(
    '6. PETRÓLEO CRUDO Y GAS NATURAL',
    'PETROLEO_Y_GAS',
    'Petróleo crudo y gas natural',
    'MINAS_Y_CANTERAS',
  ),
  branch(
    '7. MINERALES METÁLICOS Y NO METÁLICOS',
    'MINERALES',
    'Minerales metálicos y no metálicos',
    'MINAS_Y_CANTERAS',
  ),

  branch('8. CARNES FRESCAS Y ELABORADAS', 'CARNES', 'Carnes frescas y elaboradas', 'MANUFACTURA'),
  branch('9. PRODUCTOS LACTEOS', 'LACTEOS', 'Productos lácteos', 'MANUFACTURA'),
  branch(
    '10. PRODUCTOS DE MOLINERÍA Y PANADERÍA',
    'MOLINERIA_Y_PANADERIA',
    'Productos de molinería y panadería',
    'MANUFACTURA',
  ),
  branch('11. AZÚCAR Y CONFITERÍA', 'AZUCAR_Y_CONFITERIA', 'Azúcar y confitería', 'MANUFACTURA'),
  branch(
    '12. PRODUCTOS ALIMENTICIOS DIVERSOS',
    'ALIMENTICIOS_DIVERSOS',
    'Productos alimenticios diversos',
    'MANUFACTURA',
  ),
  branch('13. BEBIDAS', 'BEBIDAS', 'Bebidas', 'MANUFACTURA'),
  branch('14. TABACO ELABORADO', 'TABACO', 'Tabaco elaborado', 'MANUFACTURA'),
  branch(
    '15. TEXTILES, PRENDAS DE VESTIR Y PROD. DEL CUERO',
    'TEXTILES_Y_CUERO',
    'Textiles, prendas de vestir y productos del cuero',
    'MANUFACTURA',
  ),
  branch(
    '16. MADERA Y PRODUCTOS DE MADERA',
    'MADERA',
    'Madera y productos de madera',
    'MANUFACTURA',
  ),
  branch('17. PAPEL Y PRODUCTOS DE PAPEL', 'PAPEL', 'Papel y productos de papel', 'MANUFACTURA'),
  branch(
    '18. SUBSTANCIAS Y PRODUCTOS QUÍMICOS',
    'QUIMICOS',
    'Sustancias y productos químicos',
    'MANUFACTURA',
  ),
  branch(
    '19. PRODUCTOS DE REFINACIÓN DEL PETRÓLEO',
    'REFINACION_DE_PETROLEO',
    'Productos de refinación del petróleo',
    'MANUFACTURA',
  ),
  branch(
    '20. PRODUCTOS DE MINERALES NO METÁLICOS',
    'MINERALES_NO_METALICOS',
    'Productos de minerales no metálicos',
    'MANUFACTURA',
  ),
  branch(
    '21. PRODUCTOS BÁSICOS DE METALES',
    'METALES_BASICOS',
    'Productos básicos de metales',
    'MANUFACTURA',
  ),
  branch(
    '22. PRODUCTOS METÁLICOS, MAQUINARIA Y EQUIPO',
    'METALMECANICA',
    'Productos metálicos, maquinaria y equipo',
    'MANUFACTURA',
  ),
  branch(
    '23. PRODUCTOS MANUFACTURADOS DIVERSOS',
    'MANUFACTURAS_DIVERSAS',
    'Productos manufacturados diversos',
    'MANUFACTURA',
  ),

  group('24. ELECTRICIDAD, GAS Y AGUA', 'ELECTRICIDAD_GAS_Y_AGUA', 'Electricidad, gas y agua'),
  group('25. CONSTRUCCIÓN Y OBRAS PÚBLICAS', 'CONSTRUCCION', 'Construcción y obras públicas'),
  group('26. COMERCIO', 'COMERCIO', 'Comercio'),

  branch(
    '27. TRANSPORTE Y ALMACENAMIENTO',
    'TRANSPORTE_Y_ALMACENAMIENTO',
    'Transporte y almacenamiento',
    'TRANSPORTE_Y_COMUNICACIONES',
  ),
  branch('28. COMUNICACIONES', 'COMUNICACIONES', 'Comunicaciones', 'TRANSPORTE_Y_COMUNICACIONES'),

  branch(
    '29. SERVICIOS FINANCIEROS',
    'SERVICIOS_FINANCIEROS',
    'Servicios financieros',
    'FINANZAS_Y_EMPRESAS',
  ),
  branch(
    '30. SERVICIOS A LAS EMPRESAS',
    'SERVICIOS_A_LAS_EMPRESAS',
    'Servicios a las empresas',
    'FINANZAS_Y_EMPRESAS',
  ),
  branch(
    '31. PROPIEDAD DE VIVIENDA',
    'PROPIEDAD_DE_VIVIENDA',
    'Propiedad de vivienda',
    'FINANZAS_Y_EMPRESAS',
  ),

  branch(
    '32. SERVICIOS COMUNALES, SOCIALES Y PERSONALES',
    'SERVICIOS_PERSONALES',
    'Servicios comunales, sociales y personales',
    'SERVICIOS_COMUNALES',
  ),
  group('33. RESTAURANTES Y HOTELES', 'RESTAURANTES_Y_HOTELES', 'Restaurantes y hoteles'),
  branch(
    '34. SERVICIOS DOMESTICOS',
    'SERVICIOS_DOMESTICOS',
    'Servicios domésticos',
    'SERVICIOS_COMUNALES',
  ),
  group(
    '35. SERVICIOS DE LA ADMINISTRACIÓN PÚBLICA',
    'ADMINISTRACION_PUBLICA',
    'Servicios de la administración pública',
  ),

  IMPUTED_BANK_SERVICES,
];
