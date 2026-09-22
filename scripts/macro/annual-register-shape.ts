/**
 * La forma que los dos colectores escriben y que el sembrador lee.
 *
 * Vive aparte de los dos porque es su contrato: el colector del INE y el del
 * registro empresarial no comparten ni fuente ni formato ni publicador, y lo
 * único que tienen en común es el archivo que producen. Escrita dos veces, una
 * en cada uno, el día que el esquema gane un campo habría que acordarse de los
 * dos sitios — y la mitad de las veces no se acuerda nadie.
 *
 * Espeja `annual-register.schema.ts`, que es quien manda: ese valida lo que
 * entra a la base, esto sólo ayuda a escribirlo bien. Si los dos se separan, el
 * que se queja es el esquema, en la corrida del sembrador.
 */

/** Una lectura, con la prueba de dónde salió. */
export interface RegisterPoint {
  period: string;
  value: string;
  excerpt: string;
  sourceUrl: string;
  upstreamSha256: string;
  retrievedAt: string;
}

/**
 * Si una fila se puede sumar con sus hermanas, y en qué plano vive.
 *
 * `COUNTRY` y `AGGREGATE` son totales que ya contienen a los demás: quien sume
 * todo lo que comparte prefijo cuenta el país dos veces.
 */
export type RegisterLevel = 'COUNTRY' | 'DEPARTMENT' | 'PRODUCT' | 'COMPANY' | 'AGGREGATE';

/** Una serie anual que pertenece a un sitio o a alguien. */
export interface RegisterSeries {
  indicatorCode: string;
  name: string;
  group: string;
  groupLabel: string;
  measure: string;
  level: RegisterLevel;
  unit: string;
  basis: string;
  publisher: string;
  frequency: 'ANNUAL';
  points: RegisterPoint[];
}

/** Lo que se cuenta al terminar, que es lo único que dice si la corrida sirvió. */
export const countPoints = (series: readonly RegisterSeries[]): number =>
  series.reduce((count, one) => count + one.points.length, 0);
