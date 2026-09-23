/**
 * Las filas del cuadro departamental por actividad económica, una por una.
 *
 * El capítulo departamental sabía cuánto produce cada departamento y no de qué
 * vive. «Tarija cayó un tercio» no dice nada hasta saber que lo que cayó fue el
 * petróleo crudo y el gas natural mientras el resto de su economía no se movía,
 * y esa segunda frase necesita el cuadro que el INE publica aparte: el producto
 * de cada departamento abierto en once actividades y, dentro de ellas, en
 * diecinueve ramas.
 *
 * **Las filas se declaran y no se descubren.** Es lo contrario de lo que hace
 * el cuadro de exportaciones, donde cada departamento trae sus propios
 * productos y la asimetría es el dato. Aquí las treinta y cuatro filas son las
 * mismas en los nueve cuadros —comprobado cuaderno por cuaderno— porque es una
 * nomenclatura de cuentas nacionales y no la lista de lo que a cada uno le
 * sobra para vender. Declararlas convierte un cambio de nomenclatura en una
 * corrida detenida con el nombre de la fila en el mensaje, que es lo que se
 * quiere: una actividad que desaparece en silencio es una serie que deja de
 * actualizarse sin que nadie se entere.
 *
 * **Tres planos y no uno.** El cuadro abre con dos totales y la diferencia
 * entre ellos —el producto a precios de mercado, los impuestos indirectos y el
 * producto a precios básicos—, sigue con once grupos que suman ese segundo
 * total, cuelga ramas de cinco de ellos y cierra restando los servicios
 * bancarios imputados. Quien sume todo lo que comparte prefijo cuenta el
 * departamento tres veces, y por eso el plano viaja con la fila.
 */

/** En qué plano del cuadro vive una fila. */
export type ActivityLevel = 'TOTAL' | 'GROUP' | 'BRANCH' | 'ADJUSTMENT';

export interface Activity {
  /** La fila del cuadro, como el INE la escribe, sin su sangría. */
  readonly row: string;
  /** El tramo del código que identifica la serie aguas abajo. */
  readonly slug: string;
  /** Cómo se llama en el tablero, con su ortografía correcta. */
  readonly name: string;
  readonly level: ActivityLevel;
  /** El grupo del que cuelga una rama; nada en los otros tres planos. */
  readonly parent?: string;
}

/*
 * Tres constructores para que cada fila ocupe una línea y el catálogo se lea
 * como el cuadro del que salió. La alternativa —un objeto entero por fila— son
 * seis líneas por actividad y un archivo de trescientas en el que la forma tapa
 * el contenido.
 */
export const total = (row: string, slug: string, name: string): Activity => ({
  row,
  slug,
  name,
  level: 'TOTAL',
});

export const group = (row: string, slug: string, name: string): Activity => ({
  row,
  slug,
  name,
  level: 'GROUP',
});

export const branch = (row: string, slug: string, name: string, parent: string): Activity => ({
  row,
  slug,
  name,
  level: 'BRANCH',
  parent,
});

/**
 * Los servicios bancarios imputados, que se restan en vez de sumarse.
 *
 * Es el cobro que los bancos no facturan y que la contabilidad nacional imputa
 * para cuadrar el producto; en el cuadro va en negativo, y una figura que lo
 * meta entre los grupos dibuja una barra hacia abajo que nadie sabe leer. Va
 * marcado aparte, en los dos cuadros, para poder dejarlo fuera.
 */
export const IMPUTED_BANK_SERVICES: Activity = {
  row: 'Servicios Bancarios Imputados',
  slug: 'SERVICIOS_BANCARIOS_IMPUTADOS',
  name: 'Servicios bancarios imputados',
  level: 'ADJUSTMENT',
};

/*
 * El orden es el del cuaderno, y eso importa: es el orden en que la
 * nomenclatura de cuentas nacionales presenta una economía —lo que se saca de
 * la tierra, lo que se transforma, lo que se mueve, lo que se administra— y una
 * figura que lo respete se lee como el cuadro del que salió.
 */
export const DEPARTMENT_ACTIVITIES: readonly Activity[] = [
  total('PRODUCTO INTERNO BRUTO (a precios de mercado)', 'PIB_MERCADO', 'PIB a precios de mercado'),
  total(
    'Derechos s/Importaciones, IVA nd, IT y otros Imp. Indirectos',
    'IMPUESTOS_INDIRECTOS',
    'Derechos sobre importaciones, IVA no deducible, IT y otros impuestos indirectos',
  ),
  total('PRODUCTO INTERNO BRUTO (a precios básicos)', 'PIB_BASICO', 'PIB a precios básicos'),

  group(
    '1. Agricultura, Silvicultura, Caza y Pesca',
    'AGRICULTURA',
    'Agricultura, silvicultura, caza y pesca',
  ),
  branch(
    '- Productos Agrícolas no Industriales',
    'AGRICOLA_NO_INDUSTRIAL',
    'Productos agrícolas no industriales',
    'AGRICULTURA',
  ),
  branch(
    '- Productos Agrícolas Industriales',
    'AGRICOLA_INDUSTRIAL',
    'Productos agrícolas industriales',
    'AGRICULTURA',
  ),
  branch('- Coca', 'COCA', 'Coca', 'AGRICULTURA'),
  branch('- Productos Pecuarios', 'PECUARIO', 'Productos pecuarios', 'AGRICULTURA'),
  branch(
    '- Silvicultura, Caza y Pesca',
    'SILVICULTURA_CAZA_Y_PESCA',
    'Silvicultura, caza y pesca',
    'AGRICULTURA',
  ),

  group('2. Extracción de Minas y Canteras', 'MINAS_Y_CANTERAS', 'Extracción de minas y canteras'),
  branch(
    '- Petróleo Crudo y Gas Natural',
    'PETROLEO_Y_GAS',
    'Petróleo crudo y gas natural',
    'MINAS_Y_CANTERAS',
  ),
  branch(
    '- Minerales Metálicos y no Metálicos',
    'MINERALES',
    'Minerales metálicos y no metálicos',
    'MINAS_Y_CANTERAS',
  ),

  group('3. Industrias Manufactureras', 'MANUFACTURA', 'Industrias manufactureras'),
  branch('- Alimentos', 'ALIMENTOS', 'Alimentos', 'MANUFACTURA'),
  branch('- Bebidas y Tabaco', 'BEBIDAS_Y_TABACO', 'Bebidas y tabaco', 'MANUFACTURA'),
  branch(
    '- Textiles, Prendas de Vestir y Productos del Cuero',
    'TEXTILES_Y_CUERO',
    'Textiles, prendas de vestir y productos del cuero',
    'MANUFACTURA',
  ),
  branch('- Madera y Productos de Madera', 'MADERA', 'Madera y productos de madera', 'MANUFACTURA'),
  branch(
    '- Productos de Refinación del Petróleo',
    'REFINACION_DE_PETROLEO',
    'Productos de refinación del petróleo',
    'MANUFACTURA',
  ),
  branch(
    '- Productos de Minerales no Metálicos',
    'MINERALES_NO_METALICOS',
    'Productos de minerales no metálicos',
    'MANUFACTURA',
  ),
  branch(
    '- Otras Industrias Manufactureras',
    'OTRAS_MANUFACTURAS',
    'Otras industrias manufactureras',
    'MANUFACTURA',
  ),

  group('4. Electricidad, Gas y Agua', 'ELECTRICIDAD_GAS_Y_AGUA', 'Electricidad, gas y agua'),
  group('5. Construcción', 'CONSTRUCCION', 'Construcción'),
  group('6. Comercio', 'COMERCIO', 'Comercio'),

  group(
    '7. Transporte, Almacenamiento y Comunicaciones',
    'TRANSPORTE_Y_COMUNICACIONES',
    'Transporte, almacenamiento y comunicaciones',
  ),
  branch(
    '- Transporte y Almacenamiento',
    'TRANSPORTE_Y_ALMACENAMIENTO',
    'Transporte y almacenamiento',
    'TRANSPORTE_Y_COMUNICACIONES',
  ),
  branch('- Comunicaciones', 'COMUNICACIONES', 'Comunicaciones', 'TRANSPORTE_Y_COMUNICACIONES'),

  group(
    '8. Establecimientos Financieros, Seguros, Bienes Inmuebles y Servicios Prestados a las Empresas',
    'FINANZAS_Y_EMPRESAS',
    'Establecimientos financieros, seguros, bienes inmuebles y servicios a las empresas',
  ),
  branch(
    '- Servicios Financieros',
    'SERVICIOS_FINANCIEROS',
    'Servicios financieros',
    'FINANZAS_Y_EMPRESAS',
  ),
  branch(
    '- Servicios a las Empresas',
    'SERVICIOS_A_LAS_EMPRESAS',
    'Servicios a las empresas',
    'FINANZAS_Y_EMPRESAS',
  ),
  branch(
    '- Propiedad de Vivienda',
    'PROPIEDAD_DE_VIVIENDA',
    'Propiedad de vivienda',
    'FINANZAS_Y_EMPRESAS',
  ),

  group(
    '9. Servicios Comunales, Sociales, Personales y Domésticos',
    'SERVICIOS_COMUNALES',
    'Servicios comunales, sociales, personales y domésticos',
  ),
  group('10. Restaurantes y Hoteles', 'RESTAURANTES_Y_HOTELES', 'Restaurantes y hoteles'),
  group(
    '11. Servicios de la Administración Pública',
    'ADMINISTRACION_PUBLICA',
    'Servicios de la administración pública',
  ),

  IMPUTED_BANK_SERVICES,
];
