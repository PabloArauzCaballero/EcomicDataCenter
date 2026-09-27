import { DEPARTMENT_ACTIVITIES } from './department-activity-catalogue';
import { NATIONAL_ACTIVITIES } from './national-activity-catalogue';
import type { Activity } from './department-activity-catalogue';

/**
 * De qué vive cada departamento: los cuadros del INE que lo dicen.
 *
 * Las cuentas regionales que el observatorio ya recoge contestan cuánto produce
 * un departamento y ninguna contesta de qué. Es la diferencia entre «Tarija
 * perdió un tercio de su economía» y «lo que Tarija perdió fue el gas», y la
 * segunda es la única de las dos que se puede discutir: dice qué actividad se
 * movió, contra qué tamaño y en qué década.
 *
 * El INE lo publica departamento por departamento, en un cuaderno por medida y
 * por departamento. Aquí van los treinta: nueve departamentos por tres medidas
 * —el nivel a precios constantes, su variación anual y el reparto a precios
 * corrientes— y las mismas tres del país, que es contra lo que un departamento
 * se lee.
 *
 * **Por qué tres medidas y no las cinco que publica.** Las otras dos —el nivel
 * a precios corrientes y el deflactor por actividad— no contestan ninguna
 * pregunta que este capítulo haga y cada una son treinta y cuatro series por
 * departamento. El nivel constante dice el tamaño real, la variación dice el
 * movimiento y el reparto dice la estructura; con esas tres se arma la frase
 * entera. El día que haga falta el deflactor por actividad, se añade aquí y el
 * colector no cambia.
 *
 * **Los identificadores son enlaces compartidos de la nube del INE**, no
 * direcciones estables: si el instituto republica un cuadro, cambian. El
 * colector no lo disimula —una descarga que no llega detiene la corrida con el
 * número del cuadro en el mensaje— por lo mismo que en `department-sources`.
 */

/** Una de las tres medidas que se leen de cada cuadro. */
export interface ActivityMeasure {
  /** El tramo del código, después de `DEPT_ACT_`. */
  readonly slug: string;
  /** El sufijo del número de cuadro que el INE le da: 7.01.01, 7.01.02, 7.02.02. */
  readonly table: string;
  readonly measure: string;
  readonly unit: string;
  readonly basis: string;
}

export const ACTIVITY_MEASURES: readonly ActivityMeasure[] = [
  {
    slug: 'VALUE',
    table: '01.01',
    measure: 'Producto por actividad, a precios constantes',
    unit: 'BOB_THOUSANDS_1990',
    basis: 'En miles de bolivianos de 1990. Es el tamaño real de la actividad, sin la inflación.',
  },
  {
    slug: 'GROWTH',
    table: '01.02',
    measure: 'Crecimiento de la actividad',
    unit: 'PERCENT',
    basis:
      'Variación anual del producto de la actividad a precios constantes de 1990, según el INE.',
  },
  {
    slug: 'SHARE',
    table: '02.02',
    measure: 'Participación de la actividad',
    unit: 'PERCENT',
    basis: 'Parte del producto del lugar a precios corrientes que aporta la actividad.',
  },
];

/** Un lugar con su cuaderno abierto por actividad. */
export interface ActivityTables {
  /** El tramo del código que nombra el lugar, el mismo de `department-sources`. */
  readonly place: string;
  readonly name: string;
  /** El número de familia que el INE da a sus cuadros: Chuquisaca 1, Pando 9. */
  readonly book: string;
  /** El enlace compartido de cada medida, en el orden de `ACTIVITY_MEASURES`. */
  readonly shares: readonly [string, string, string];
}

/*
 * El orden es el del INE —Chuquisaca primero, Pando noveno— y no el del tamaño.
 * Es el mismo que ya usan las cuentas regionales, y que dos listas del mismo
 * capítulo ordenen igual es lo que permite leerlas juntas.
 */
export const DEPARTMENT_ACTIVITY_TABLES: readonly ActivityTables[] = [
  {
    place: 'CHUQUISACA',
    name: 'Chuquisaca',
    book: '1',
    shares: ['hHU8psn75hWR8fV', 'fjrtQnTVWO37WXD', 'n2BL5kNrHB8vs6E'],
  },
  {
    place: 'LA_PAZ',
    name: 'La Paz',
    book: '2',
    shares: ['JGySvLfLxfxhIzb', 'FdvExIEZ27HNZTn', 'nyW23XSTgZPgPkw'],
  },
  {
    place: 'COCHABAMBA',
    name: 'Cochabamba',
    book: '3',
    shares: ['TPp9wVaoTi9eRxp', 'Ga8cEWN1Fl8dhnw', 'VzNRxQGMTFKgB0Z'],
  },
  {
    place: 'ORURO',
    name: 'Oruro',
    book: '4',
    shares: ['PycgCZK6K6siAJc', 'j2az8k6SKotxpMF', 'J1Bt9MF6cxVWY0B'],
  },
  {
    place: 'POTOSI',
    name: 'Potosí',
    book: '5',
    shares: ['NkBlw9xk2zTIcFO', '3YXR7szfR3Q7TFn', 'nVr49vWVKMWZX0f'],
  },
  {
    place: 'TARIJA',
    name: 'Tarija',
    book: '6',
    shares: ['vILrN7dlWg53tMl', 'XFZtiPTrzqyCIaW', 'HA5C4YZLhrJb3U7'],
  },
  {
    place: 'SANTA_CRUZ',
    name: 'Santa Cruz',
    book: '7',
    shares: ['WFE06wQEezoctP5', 'ndDJuunchuF1MpK', 'EsenEoMg4j88jXD'],
  },
  {
    place: 'BENI',
    name: 'Beni',
    book: '8',
    shares: ['f5jJXWvS5DT3joh', '50ckwLTrbNADm8k', 'oWBU7n0Alb79krY'],
  },
  {
    place: 'PANDO',
    name: 'Pando',
    book: '9',
    shares: ['K9n4oiVsQoPyBsu', 'Pz4su0x9IRmGUZe', 'a6I3bgB5p9hZUSo'],
  },
];

/**
 * El país, en los mismos tres cuadros.
 *
 * Su familia es la 5 y la de Potosí también, porque el INE numera por
 * publicación y no por un mapa: los cuadros nacionales por actividad viven en
 * «Producto Interno Bruto Anual» y los departamentales en «Producto Interno
 * Bruto Departamental». El número del cuadro sólo viaja dentro del extracto,
 * como referencia para quien audite, y ahí va acompañado de la dirección de
 * descarga, que sí es única.
 */
export const NATIONAL_ACTIVITY_TABLES: ActivityTables = {
  place: 'BOLIVIA',
  name: 'Bolivia',
  book: '5',
  shares: ['v5h4f7DS2MbQcFl', 'FOvbAJODHkEPbLE', 'kPc4C0JddFgkeXg'],
};

/** Las filas que trae el cuadro de un lugar: el país abre más que un departamento. */
export const activitiesOf = (place: string): readonly Activity[] =>
  place === NATIONAL_ACTIVITY_TABLES.place ? NATIONAL_ACTIVITIES : DEPARTMENT_ACTIVITIES;

/** El número de cuadro, que es lo que se cita cuando alguien pide la fuente. */
export const activityTable = (tables: ActivityTables, measure: ActivityMeasure): string =>
  `${tables.book}.${measure.table}`;

/**
 * El prefijo de las series por actividad, y por qué lleva un tramo propio.
 *
 * `DEPT_` ya marca todo lo departamental y la vista anual lo archiva por ahí,
 * así que estas series entran al rubro correcto sin tocar ninguna migración.
 * El `ACT_` que sigue es para el lector de códigos del tablero: sin él,
 * `DEPT_VALUE_TARIJA_PETROLEO_Y_GAS` se leería con las reglas de las cuentas
 * regionales —medida, lugar, y lo que sobra es un producto exportado— y un
 * capítulo pintaría el gas de Tarija como si fuera una partida de aduana.
 */
export const ACTIVITY_PREFIX = 'DEPT_ACT_';

/** El identificador de una serie: medida, lugar y actividad, en ese orden. */
export const activityCode = (measure: string, place: string, activity: string): string =>
  `${ACTIVITY_PREFIX}${measure}_${place}_${activity}`;
