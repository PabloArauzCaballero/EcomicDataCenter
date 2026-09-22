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

const MERCO_2026 =
  'https://www.infodiez.com/cerveceria-boliviana-nacional-embol-coca-cola-y-farmacorp-encabezan-el-ranking-de-las-empresas-con-mejor-reputacion-de-bolivia-en-la-ultima-edicion/';
const MERCO_2024 =
  'https://www.economy.com.bo/articulo/branding-y-rse/ranking-merco-2024-empresas-mejor-reputacion-bolivia/20250611101932018700.html';

/**
 * Una posición que la página escribe en prosa y no con su marcador.
 *
 * El artículo de la edición 2024 pone el podio en la frase de entrada —«se
 * sitúa a la cabeza … seguida de … y la cadena de farmacias …»— y sólo numera
 * del cuarto puesto en adelante. Esas tres posiciones no se pueden extraer con
 * la misma regla que las otras siete, así que se declaran aquí con el trozo
 * exacto de la frase que las afirma, y el colector se niega a escribirlas si no
 * encuentra ese trozo literal en la página. No es una transcripción de
 * confianza: es una afirmación con su cita, comprobada en cada corrida.
 */
export interface Podium {
  readonly rank: number;
  readonly company: string;
  /** El fragmento que tiene que aparecer literal para que la fila se escriba. */
  readonly anchor: string;
}

/** Cómo se lee una edición del monitor en la página que la publica. */
export interface ReputationEdition {
  readonly monitor: string;
  /** El rótulo entero, para citarlo tal como Merco lo escribe. */
  readonly edition: string;
  /** El año con el que entra al corpus: el último de su rótulo. */
  readonly period: string;
  readonly url: string;
  /** El tramo de la página donde está el ránking general, por sus dos extremos. */
  readonly general: { readonly from: string; readonly to: string; readonly expected: number };
  /** Las posiciones que la página no numera, con su cita. */
  readonly podium: readonly Podium[];
  /** El tramo del ránking sectorial, cuando la página lo trae. */
  readonly sectors?: {
    readonly from: string;
    readonly to: string;
    /** Los sectores, escritos como la página los imprime. */
    readonly names: readonly string[];
  };
}

/**
 * Los sectores de la edición 2025-2026, en el orden en que la página los lista.
 *
 * Están declarados y no deducidos porque el cuadro no separa el sector de la
 * primera empresa con nada: «ALIMENTACIÓN SOFÍA LTDA. (1º)» es una sola cadena
 * y no hay forma de saber dónde acaba uno y empieza la otra sin saber ya cómo
 * se llama el sector. El colector exige encontrarlos todos: uno que falte
 * significa que Merco renombró un sector, y eso hay que verlo, no absorberlo.
 */
const SECTORS_2026 = [
  'ALIMENTACIÓN',
  'ASESORES AGROPECUARIO Y VETERINARIO',
  'AUTOMOCIÓN',
  'BEBIDAS',
  'BIENES RAÍCES',
  'CADENA DE FARMACIAS',
  'CADENA DE SUPERMERCADOS',
  'CALZADOS',
  'CENTRO COMERCIAL',
  'CLÍNICAS',
  'CONSTRUCCIÓN',
  'CONSULTORES Y/O OUTSOURCING',
  'COOPERATIVAS DE SERVICIOS PÚBLICOS',
  'CUIDADO PERSONAL',
  'DELIVERY',
  'EMPAQUES Y EMBALAJES SOSTENIBLES',
  'EMPRESARIAL CORPORATIVO',
  'ENERGÍA',
  'ENTIDADES FINANCIERAS',
  'FORMACIÓN',
  'HIDROCARBUROS Y ENERGÍA',
  'HOLDING',
  'HOTELERÍA Y TURISMO',
  'INDUSTRIA COMERCIAL',
  'INDUSTRIA DE LOGÍSTICA',
  'INDUSTRIAL Y MANUFACTURA',
  'LABORATORIOS SALUD',
  'LOGÍSTICA, DISTRIBUCIÓN Y COMERCIALIZACIÓN',
  'MEDIOS DE COMUNICACIÓN',
  'MINERÍA',
  'PRODUCTOS Y SERVICIOS AGROINDUSTRIALES',
  'RESTAURANTES Y CADENAS DE COMIDA',
  'RETAIL GENERALISTA',
  'SALUD Y EQUIPAMIENTO MÉDICO',
  'SEGUROS',
  'SERVICIOS LEGALES',
  'TECNOLOGÍA',
  'TELECOMUNICACIONES',
  'TRANSPORTE',
] as const;

export const REPUTATION_EDITIONS: readonly ReputationEdition[] = [
  {
    monitor: 'Merco Empresas',
    edition: 'Merco Empresas Bolivia 2025-2026',
    period: '2026',
    url: MERCO_2026,
    general: {
      from: 'Top 10 del Ranking Merco Empresas Bolivia 2025-2026',
      to: 'Top 3 Ranking sectorial',
      expected: 10,
    },
    podium: [],
    sectors: {
      from: 'Top 3 Ranking sectorial Merco Empresas Bolivia 2025-2026',
      to: 'Top 10 del Ranking Merco Líderes',
      names: SECTORS_2026,
    },
  },
  {
    monitor: 'Merco Empresas',
    edition: 'Merco Empresas Bolivia 2024',
    period: '2024',
    url: MERCO_2024,
    general: { from: 'El top ten lo completan', to: 'Para la CBN', expected: 7 },
    podium: [
      {
        rank: 1,
        company: 'Cervecería Boliviana Nacional',
        anchor: 'la Cervecería Boliviana Nacional (CBN) se sitúa a la cabeza',
      },
      {
        rank: 2,
        company: 'Sofía',
        anchor: 'seguida de la empresa de alimentos Sofía Ltda.',
      },
      {
        rank: 3,
        company: 'Farmacorp',
        anchor: 'la cadena de farmacias Farmacorp',
      },
    ],
  },
];

export const REPUTATION_PUBLISHER = 'MERCO';
