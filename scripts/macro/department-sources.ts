/**
 * Bolivia por departamento: de dónde sale cada cifra y por qué esa y no otra.
 *
 * El observatorio medía un solo país. Todas sus series anuales —el PIB, las
 * exportaciones, las rentas del subsuelo— son un número por año para nueve
 * departamentos a la vez, y con eso no se puede contestar la pregunta que
 * cualquiera hace primero: dónde. Que el gas cayera y el oro subiera no es un
 * hecho nacional, es Tarija perdiendo y La Paz ganando, y en la cifra agregada
 * las dos mitades se cancelan hasta parecer quietud.
 *
 * El INE sí publica ambas cosas por departamento, en dos sitios distintos y en
 * dos formas distintas, y este archivo es la lista de los cuadros que se leen.
 *
 * **Las cuentas regionales van en cuadros cruzados.** Los cuadros 10.01.01 a
 * 10.01.06 traen una fila por departamento y una columna por año, así que un
 * solo cuaderno rinde diez series —nueve departamentos y el país— de una vez.
 * Se leen los seis y no uno: el nivel a precios constantes dice el tamaño, el
 * corriente dice los bolivianos de cada año, el crecimiento y la participación
 * son las dos preguntas que un lector hace sobre el nivel, el deflactor separa
 * precio de volumen y el per cápita divide por la gente que vive ahí. Ninguno
 * se deriva de otro sin suponer algo: el crecimiento publicado por el INE es el
 * del nivel a precios constantes de 1990 y recalcularlo aquí produciría un
 * número parecido y no el suyo.
 *
 * **El per cápita cierra un año antes.** Su cuadro llega a 2023 mientras los
 * otros cinco llegan a 2024, porque necesita la proyección de población y esa
 * sale después. No se rellena: una serie con un año menos es correcta, y
 * estirarla inventaría el dato que el INE todavía no publicó.
 *
 * **Las exportaciones van en un cuadro anidado.** Un solo cuaderno con dos
 * hojas —valor en millones de dólares y peso neto en toneladas— donde cada
 * departamento abre un bloque y debajo cuelgan sus principales productos. Se
 * leen las dos hojas por la misma razón que las partidas del Sistema Armonizado
 * se leen en dólares y en kilos: el valor mezcla precio con volumen, y sólo el
 * peso contesta cuánto salió de verdad.
 *
 * **Los productos no son los mismos en cada departamento.** El INE lista los
 * principales de cada uno y cierra con «Otros Productos», así que Potosí tiene
 * carbonato de litio y Pando no tiene ninguno de los de Potosí. Esa asimetría
 * es el dato —dice de qué vive cada departamento— y por eso los productos se
 * descubren leyendo el cuaderno en vez de declararse aquí: el día que el INE
 * añada uno, la serie aparece sola.
 *
 * **El año en curso entra y se marca.** La última columna del cuadro de
 * exportaciones es un acumulado parcial —«Enero a Julio 2026»— y no es
 * comparable con los años cerrados de su izquierda. Se lee igual, porque es la
 * cifra más reciente que existe, y viaja con `partial: true` para que ningún
 * gráfico la ponga en la misma línea sin decirlo.
 */

/** Un departamento, tal como el INE escribe su fila. */
export interface Department {
  /** La fila del cuadro, sin tilde y en mayúsculas, como viene del cuaderno. */
  readonly row: string;
  /** El tramo del código que identifica la serie aguas abajo. */
  readonly slug: string;
  /** Cómo se llama en el tablero, con su ortografía correcta. */
  readonly name: string;
  /**
   * `COUNTRY` para la fila de Bolivia, `DEPARTMENT` para las nueve suyas.
   *
   * Lo lleva el catálogo y no el dibujo porque es una propiedad del dato: quien
   * sume las diez filas contaría el país dos veces.
   */
  readonly level: 'COUNTRY' | 'DEPARTMENT';
}

export const DEPARTMENTS: readonly Department[] = [
  { row: 'BOLIVIA', slug: 'BOLIVIA', name: 'Bolivia', level: 'COUNTRY' },
  { row: 'CHUQUISACA', slug: 'CHUQUISACA', name: 'Chuquisaca', level: 'DEPARTMENT' },
  { row: 'LA PAZ', slug: 'LA_PAZ', name: 'La Paz', level: 'DEPARTMENT' },
  { row: 'COCHABAMBA', slug: 'COCHABAMBA', name: 'Cochabamba', level: 'DEPARTMENT' },
  { row: 'ORURO', slug: 'ORURO', name: 'Oruro', level: 'DEPARTMENT' },
  { row: 'POTOSI', slug: 'POTOSI', name: 'Potosí', level: 'DEPARTMENT' },
  { row: 'TARIJA', slug: 'TARIJA', name: 'Tarija', level: 'DEPARTMENT' },
  { row: 'SANTA CRUZ', slug: 'SANTA_CRUZ', name: 'Santa Cruz', level: 'DEPARTMENT' },
  { row: 'BENI', slug: 'BENI', name: 'Beni', level: 'DEPARTMENT' },
  { row: 'PANDO', slug: 'PANDO', name: 'Pando', level: 'DEPARTMENT' },
];

/** Una de las seis medidas que el INE publica cruzando departamento por año. */
export interface RegionalAccount {
  /** El cuadro del INE, que es también el nombre del archivo que sirve. */
  readonly table: string;
  /** El identificador del enlace compartido en la nube del INE. */
  readonly share: string;
  /** El tramo del código, antes del departamento. */
  readonly slug: string;
  /** Cómo se llama la medida en el tablero. */
  readonly measure: string;
  /** La unidad, dicha como el cuadro la declara en su tercera línea. */
  readonly unit: string;
  /** La nota que el tablero pone bajo el gráfico para que nadie compare mal. */
  readonly basis: string;
}

/**
 * Los seis cuadros, con el identificador que el INE les da en su nube.
 *
 * El identificador es un enlace compartido y no una dirección estable con
 * nombre: si el INE republica un cuadro, cambia. El colector no lo disimula
 * —una descarga que no llega detiene la corrida con el número del cuadro en el
 * mensaje— porque un cuadro que desapareció en silencio es una serie que deja
 * de actualizarse sin que nadie se entere, y eso es peor que una corrida rota.
 */
export const REGIONAL_ACCOUNTS: readonly RegionalAccount[] = [
  {
    table: '10.01.01',
    share: 'xIGHrQ5jDlaLkRc',
    slug: 'GDP_CONSTANT',
    measure: 'PIB a precios constantes',
    unit: 'BOB_THOUSANDS_1990',
    basis: 'En miles de bolivianos de 1990, a precios de mercado.',
  },
  {
    table: '10.01.02',
    share: 'ygA05qOqUF2T9q1',
    slug: 'GDP_GROWTH',
    measure: 'Crecimiento del PIB',
    unit: 'PERCENT',
    basis: 'Variación anual del PIB a precios constantes de 1990, según el INE.',
  },
  {
    table: '10.01.03',
    share: 'gYngDQAZz7QANop',
    slug: 'GDP_CURRENT',
    measure: 'PIB a precios corrientes',
    unit: 'BOB_THOUSANDS',
    basis: 'En miles de bolivianos de cada año, a precios de mercado.',
  },
  {
    table: '10.01.04',
    share: 'PEtIcuVdcCqsejn',
    slug: 'GDP_SHARE',
    measure: 'Participación en el PIB',
    unit: 'PERCENT',
    basis: 'Parte del PIB del país a precios corrientes. Las nueve suman cien.',
  },
  {
    table: '10.01.05',
    share: 'gFZ8WCmJA0QLXmt',
    slug: 'GDP_DEFLATOR',
    measure: 'Deflactor implícito del PIB',
    unit: 'INDEX',
    basis: 'Índice de precios implícito en el PIB, base 1990 = 100.',
  },
  {
    table: '10.01.06',
    share: '5iLdOjvtBAh67wo',
    slug: 'GDP_PER_CAPITA',
    measure: 'PIB per cápita',
    unit: 'BOB',
    basis: 'En bolivianos corrientes por habitante, a precios de mercado.',
  },
];

/**
 * El cuaderno de exportaciones por departamento y producto.
 *
 * Una sola descarga con las dos hojas dentro, que es lo que permite que el
 * valor y el peso de una misma fila compartan dirección y huella: quien audite
 * una cifra de Santa Cruz en toneladas encuentra el mismo archivo que la
 * respalda en dólares.
 */
export const DEPARTMENT_EXPORTS = {
  share: 'WZY6zSwUD3XV1sc',
  /** Las dos hojas, por el orden en que el cuaderno las guarda. */
  sheets: [
    { slug: 'EXPORTS_USD', measure: 'Exportaciones', unit: 'USD_MILLIONS' },
    { slug: 'EXPORTS_TONNES', measure: 'Exportaciones (peso neto)', unit: 'TONNES' },
  ],
} as const;

/**
 * Las filas del cuadro de exportaciones que no son un departamento ni un
 * producto suyo.
 *
 * `TOTAL` incluye reexportaciones y efectos personales; `EXPORTACIONES` es lo
 * que el país vendió de lo suyo, y es la fila con la que se compara la suma de
 * los nueve departamentos. Las otras tres se leen aparte porque no pertenecen a
 * ningún departamento: colgarlas de uno inventaría un origen que el cuadro no
 * declara.
 */
export const EXPORT_AGGREGATES: ReadonlyArray<{ row: string; slug: string; name: string }> = [
  { row: 'TOTAL', slug: 'TOTAL', name: 'Total declarado (con reexportaciones)' },
  { row: 'EXPORTACIONES', slug: 'NATIONAL', name: 'Exportaciones del país' },
  { row: 'REEXPORTACIONES(1)', slug: 'REEXPORTS', name: 'Reexportaciones' },
  { row: 'EFECTOS PERSONALES', slug: 'PERSONAL_EFFECTS', name: 'Efectos personales' },
];

/** Dónde sirve el INE sus cuadros. */
export const INE_CLOUD = 'https://nube.ine.gob.bo/index.php/s';

/** La dirección de un cuadro, que es la que se cita como prueba. */
export const tableUrl = (share: string): string => `${INE_CLOUD}/${share}/download`;

export const PUBLISHER = 'INSTITUTO NACIONAL DE ESTADISTICA';

export const USER_AGENT = 'Mozilla/5.0 (compatible; ObservatorioEconomicoBO/1.0)';

/** El prefijo con el que la migración reconoce todas estas series de una vez. */
export const INDICATOR_PREFIX = 'DEPT_';

/**
 * El identificador de una serie de cuentas regionales.
 *
 * El departamento va al final y no al principio, de modo que las seis medidas
 * de un mismo departamento no queden juntas al ordenar por código: quien lee la
 * lista ordenada ve las diez filas de una medida seguidas, que es la
 * comparación que el cuadro invita a hacer.
 */
export const accountCode = (account: RegionalAccount, department: Department): string =>
  `${INDICATOR_PREFIX}${account.slug}_${department.slug}`;

/** El identificador de una serie de exportaciones, con producto o sin él. */
export const exportCode = (sheetSlug: string, place: string, product?: string): string =>
  `${INDICATOR_PREFIX}${sheetSlug}_${place}${product ? `_${product}` : ''}`;

/**
 * El tramo de código que nombra a un producto del cuadro.
 *
 * El INE los escribe como títulos —«Gas Licuado de Petroleo (GLP)»— y un código
 * no puede llevar tildes, paréntesis ni espacios. La traducción es mecánica y
 * vive aquí y no en el colector porque el sembrador y las pruebas tienen que
 * poder reproducirla sin volver a leer el cuaderno.
 */
export function productSlug(label: string): string {
  return label
    .normalize('NFD')
    .replace(/[̀-ͯ]/gu, '')
    .toLocaleUpperCase('en')
    .replace(/[^A-Z0-9]+/gu, '_')
    .replace(/^_+|_+$/gu, '')
    .slice(0, 40);
}
