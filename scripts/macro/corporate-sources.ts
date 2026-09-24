/**
 * Quién exporta más y quién tiene mejor nombre: dos registros y sus límites.
 *
 * Esta es la parte del observatorio donde la fuente oficial no existe, y el
 * archivo empieza diciéndolo porque de ahí sale todo lo demás.
 *
 * **Bolivia no publica sus exportaciones por empresa.** Se comprobó una por una
 * el 2026-09-22: el INE llega a departamento, producto y país de destino; la
 * Aduana Nacional publica estadística agregada; el portal de comercio exterior
 * del Ministerio de Desarrollo Productivo desglosa por clasificador arancelario
 * y por departamento; el Anuario del Ministerio de Minería separa por actor
 * productivo —estatal, privado, cooperativo— y por mineral. Ninguno nombra a
 * una empresa. La declaración aduanera individual está amparada por reserva, y
 * eso no es una laguna del tablero: es una decisión del Estado boliviano, y el
 * capítulo la dice en vez de disimularla con una cifra de otro sitio.
 *
 * **Lo único que hay es un agregador comercial.** Datasur reconstruye el
 * ránking desde registros aduaneros y publica los cien primeros con su valor
 * FOB y su cuota. Su orden es verificable contra lo que se sabe del país —la
 * minera más grande arriba, las aceiteras y el oro detrás— pero **su total no
 * cuadra con el oficial**: 42.118 millones de dólares para 2024 contra los
 * 8.923 millones que el INE declara para el mismo año. La base de esa cifra no
 * está declarada en ninguna parte de la publicación.
 *
 * De ahí la regla de este capítulo, que es una decisión editorial y conviene
 * dejarla escrita: **se publica el orden y la cuota, y no los dólares**. La
 * cuota es internamente consistente y el orden es la respuesta a la pregunta
 * que se hizo. Los dólares son un número que este observatorio no puede
 * sostener, y un número que no se puede sostener no mejora un tablero por estar
 * en él. Sí quedan en el extracto que se guarda como prueba, porque el extracto
 * es lo que la fuente dijo y no lo que nosotros publicamos: quien audite ve la
 * fila entera, quien lee el tablero ve lo que se sostiene.
 *
 * **La reputación sí tiene monitor, y es de otra naturaleza.** Merco publica
 * desde hace trece ediciones un ránking de las cien empresas con mejor
 * reputación en Bolivia, con metodología declarada —cinco evaluaciones, trece
 * fuentes, más de mil seiscientas encuestas, un benchmarking de treinta y tres
 * indicadores— y revisión independiente de KPMG bajo norma ISAE 3000. Eso es
 * una medición y entra al corpus con su año y su puesto como cualquier otra
 * serie anual.
 *
 * Lo que **no** es: una medida de tamaño, de solvencia ni de conducta. Merco
 * mide reputación percibida entre públicos que conocen la marca, y por eso su
 * cabeza son cerveceras, bancos y farmacias mientras la cabeza de las
 * exportadoras son mineras y aceiteras que ningún consumidor nombra. Los dos
 * ránkings están en el mismo capítulo precisamente porque casi no se tocan, y
 * el único sitio donde se tocan —el ránking sectorial, donde la minera que más
 * exporta es también la primera de su sector— es el que contesta la pregunta
 * de verdad.
 *
 * **El ránking sectorial vale más que el general, aquí.** El general está
 * dominado por marcas de consumo y deja fuera media economía; el sectorial
 * nombra a la primera minera, la primera aceitera, la primera constructora y la
 * primera aseguradora, que es donde un lector de un tablero económico tiene una
 * pregunta. Por eso se recogen los dos.
 *
 * **El ránking de líderes queda fuera a propósito.** Merco mide también la
 * reputación de personas y este capítulo es de empresas; nombrar directivos no
 * contesta ninguna pregunta que el tablero haga y sí añade datos personales a
 * un corpus que no los necesita.
 */

export const USER_AGENT = 'Mozilla/5.0 (compatible; ObservatorioEconomicoBO/1.0)';

/** Los prefijos con los que la migración reconoce las dos familias de una vez. */
export const EXPORTER_PREFIX = 'EXPORTER_';
export const REPUTATION_PREFIX = 'REPUTATION_';

/** Dónde está publicado el ránking de exportadoras que se lee. */
export const EXPORTERS = {
  url: 'https://www.datasur.com/datamerica-paises/bolivia-exportaciones-nacionales-2024/',
  publisher: 'DATASUR',
  /** La gestión que la propia página declara en su título. */
  period: '2024',
  /**
   * Cuántas filas tiene que traer para que la corrida se dé por buena.
   *
   * La página publica cien. Una extracción que devuelva noventa significa que
   * la maquetación cambió y que faltan diez empresas, no que Bolivia tenga
   * noventa exportadoras; sin este mínimo, un cambio de plantilla se publicaría
   * como un ránking más corto y nadie lo notaría.
   */
  expected: 100,
} as const;

/**
 * Dónde publica Merco su monitor, y cómo hay que pedírselo.
 *
 * **Se lee la fuente y no la prensa que la cita.** Hasta septiembre de 2026 el
 * capítulo se armaba con dos artículos —uno por edición— que reproducían el
 * top diez y los tres primeros de cada sector, en prosa y con los nombres a
 * medias. La web de Merco publica el ránking entero: las cien empresas de cada
 * edición desde 2013, con su **puntuación** y su sector. Trece ediciones de
 * cien puestos contra dos de diez, y con la cifra que dice cuánto separa al
 * primero del segundo, que un puesto solo no dice.
 *
 * La puntuación es la del propio monitor: el primero vale 10.000 y el centésimo
 * 3.000, y lo de en medio está en esa escala. Se publica tal cual. No es un
 * porcentaje ni se puede comparar entre ediciones como un nivel —cada edición
 * reescala a su primero—; lo que sí se lee es la distancia dentro de una
 * edición.
 *
 * **La cookie no es un truco.** La página redirige a sí misma hasta que el
 * navegador guarda el país elegido (`m.cou1=bo`); sin ella la petición entra en
 * un bucle de redirecciones. Mandarla es lo que hace cualquier visitante que
 * haya elegido Bolivia en el selector de país.
 */
export const MERCO = {
  url: 'https://www.merco.info/bo/ranking-merco-empresas',
  cookie: 'm.cou1=bo',
  /** Cuántos puestos trae el ránking general de cada edición. */
  expected: 100,
} as const;

/** Una edición del monitor, con el año con el que entra al corpus. */
export interface ReputationEdition {
  /** Lo que la página espera en `?edicion=`. */
  readonly edicion: string;
  /** El rótulo entero, para citarlo tal como Merco lo escribe. */
  readonly edition: string;
  /**
   * El año con el que entra al corpus: el último de su rótulo.
   *
   * La edición que Merco llama «2025/26» entra como 2026, que es como la
   * nombraba la prensa de la que el capítulo leía antes y como ya está en las
   * dos bases. Cambiarla a 2025 dejaría la fila vieja de 2026 en el corpus y
   * el tablero dibujaría dos ediciones donde hay una.
   */
  readonly period: string;
}

/**
 * Las ediciones publicadas, de la más antigua a la más nueva.
 *
 * Declaradas y no descubiertas del selector de la página: una edición nueva
 * tiene que entrar a propósito, con su año decidido, y no porque la página
 * haya cambiado. El colector se detiene si una de estas deja de traer sus cien
 * puestos.
 */
export const REPUTATION_EDITIONS: readonly ReputationEdition[] = [
  ...Array.from({ length: 12 }, (_unused, index) => {
    const year = String(2013 + index);
    return { edicion: year, edition: `Merco Empresas Bolivia ${year}`, period: year };
  }),
  { edicion: '2025', edition: 'Merco Empresas Bolivia 2025-2026', period: '2026' },
];

export const REPUTATION_PUBLISHER = 'MERCO';
