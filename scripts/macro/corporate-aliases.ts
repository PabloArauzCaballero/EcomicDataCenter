/**
 * De un nombre publicado a un código y a un nombre presentable.
 *
 * Tres piezas y un solo problema: las dos listas de este capítulo escriben a la
 * misma empresa de maneras distintas, y hasta que no se pongan de acuerdo no se
 * pueden cruzar. El código sale de una normalización mecánica, las diferencias
 * que esa normalización no puede salvar salen de una tabla declarada, y las
 * mayúsculas de maquetación se deshacen con una regla.
 *
 * Vive aparte del catálogo de fuentes porque lo usan los dos colectores y
 * porque es lo único de este capítulo que hay que tocar cada año: una fuente
 * que renombre a una empresa se arregla aquí y en ningún otro sitio.
 */

/**
 * El tramo de código que nombra a una empresa.
 *
 * Mecánico y sin diccionario: las dos listas se leen de páginas que cambian
 * cada año y no pueden depender de que alguien mantenga una tabla de
 * equivalencias. Dos nombres que colapsen al mismo código son un choque que el
 * colector detiene, no una fila que se pisa en silencio.
 */
export function companySlug(name: string): string {
  return fullSlug(name).slice(0, 48);
}

/**
 * El mismo código, sin el recorte a cuarenta y ocho caracteres.
 *
 * La tabla de equivalencias de abajo se consulta con esta forma y no con la
 * recortada, y la diferencia no es teórica: «Universidad Privada de Santa Cruz
 * de la Sierra UPSA» pierde justo las tres letras que la identifican al
 * recortarse, así que su entrada nunca se encontraba y la universidad entraba
 * al corpus con dos códigos según qué edición la nombrara.
 */
function fullSlug(name: string): string {
  return name
    .normalize('NFD')
    .replace(/[̀-ͯ]/gu, '')
    .toLocaleUpperCase('en')
    .replace(/[^A-Z0-9]+/gu, '_')
    .replace(/^_+|_+$/gu, '');
}

/**
 * La misma empresa, escrita de otra manera.
 *
 * Esta tabla es lo que hace que el capítulo conteste su pregunta. Sin ella hay
 * dos listas que no se tocan: la aduanera escribe «INGENIO AZUCARERO GUABIRA
 * IG» y el monitor de reputación escribe «INGENIO AZUCARERO GUABIRÁ»; el
 * artículo de una edición dice «Sofía LTDA.» y el de la anterior dice «Sofía».
 * Codificadas tal cual, son cuatro empresas donde hay dos, Sofía no se puede
 * seguir de un año al siguiente y ninguna exportadora se puede cruzar con su
 * reputación.
 *
 * La clave es el código que sale del nombre publicado y el valor es la forma
 * canónica. Sólo entra aquí lo que se ha visto escrito de dos maneras en las
 * fuentes que este colector lee: no es un directorio de empresas bolivianas ni
 * pretende serlo, y una empresa que aparezca una sola vez no necesita entrada.
 *
 * El extracto que se guarda como prueba conserva el nombre **como la fuente lo
 * escribió**. Lo que se unifica es la fila del tablero, no la cita.
 */
const ALIASES: Readonly<Record<string, string>> = {
  SOFIA_LTDA: 'Sofía',
  SOFIA: 'Sofía',
  CERVECERIA_BOLIVIANA_NACIONAL_CBN: 'Cervecería Boliviana Nacional',
  EMBOL_COCA_COLA: 'Embol Coca-Cola',
  DROGUERIA_INTI_S_A: 'Droguería INTI',
  DROGUERIA_INTI: 'Droguería INTI',
  BANCO_NACIONAL_DE_BOLIVIA_BNB: 'Banco Nacional de Bolivia',
  BANCO_DE_CREDITO_DE_BOLIVIA_BCP: 'Banco de Crédito de Bolivia',
  BANCO_MERCANTIL_SANTA_CRUZ_BMSC: 'Banco Mercantil Santa Cruz',
  UNIVERSIDAD_PRIVADA_DE_SANTA_CRUZ_DE_LA_SIERRA_UPSA: 'UPSA',
  IMCRUZ_INCHCAPE_BOLIVIA: 'Imcruz',
  INGENIO_AZUCARERO_GUABIRA_IG: 'Ingenio Azucarero Guabirá',
  INGENIO_AZUCARERO_GUABIRA: 'Ingenio Azucarero Guabirá',
  INGENIO_SUCROALCOHOLERO_AGUAI: 'Aguaí',
  AGUAI_INGENIO_SUCROALCOHOLERO: 'Aguaí',
  ASSURESOFT_BOLIVIA: 'Assuresoft',
  ASSURESOFT: 'Assuresoft',
  CORPORACION_MINERA_DE_BOLIVIA: 'Comibol',
  YACIMIENTOS_PETROLIFEROS_YPFB: 'YPFB',
  TOTAL_E_P_BOLIVIA: 'TotalEnergies Bolivia',
  /*
   * Siglas con vocales, que la regla mecánica de abajo no puede distinguir de
   * una palabra. Son las que aparecen hoy en las dos listas; una nueva se nota
   * porque sale escrita como nombre propio en el tablero.
   */
  BOLIVIANA_DE_AVIACION_BOA: 'Boliviana de Aviación BOA',
  FRIGORIFICO_BFC: 'Frigorífico BFC',
  INDUSTRIAS_DE_ACEITE: 'Industrias de Aceite (IOL)',
  PAN_AMERICAN_SILVER_BOLIVIA: 'Pan American Silver Bolivia',
  FRIGORIFICO_DEL_ORIENTE_FRIDOSA: 'Fridosa',
  EMPRESA_MINERA_UNIFICADA_EMUSA: 'Emusa',
  YACIMIENTOS_DE_LITIO_BOLIVIANOS: 'Yacimientos de Litio Bolivianos (YLB)',
  /*
   * Las que las dos listas escriben distinto y la regla mecánica no reconcilia:
   * una acentúa y la otra no, o una capitaliza una sigla que la otra deja
   * entera. El código ya las unía —por eso el cruce funcionaba— pero el nombre
   * dibujado dependía de cuál de las dos filas se leyera primero.
   */
  MINERA_SAN_CRISTOBAL: 'Minera San Cristóbal',
  PIL_ANDINA: 'PIL Andina',
  SINCHI_WAYRA: 'Sinchi Wayra',
  JALASOFT: 'Jalasoft',
};

/** Las palabras que en castellano van en minúscula dentro de un nombre propio. */
const PARTICLES = new Set(['de', 'del', 'la', 'las', 'los', 'el', 'y', 'e', 'en']);

/**
 * Un nombre gritado, devuelto a su forma de nombre.
 *
 * Las dos fuentes imprimen sus listas en mayúsculas —«MINERA SAN CRISTOBAL»,
 * «FRIGORÍFICO BFC»— porque así se maqueta una tabla, no porque la empresa se
 * llame así. Mezclado con los nombres que la tabla de arriba ya corrige, el
 * tablero salía con la mitad de las filas gritando y la otra mitad no.
 *
 * La regla es mecánica y tiene una sola excepción declarada: **una palabra sin
 * vocales se queda como está**. Es lo que distingue una sigla de una palabra
 * —BFC, YPFB, SRL— sin mantener una lista de siglas que habría que ampliar cada
 * año. Las siglas que sí tienen vocales, como BOA, se corrigen en la tabla de
 * equivalencias, que es donde viven las excepciones de este capítulo.
 *
 * Sólo se aplica cuando el nombre viene entero en mayúsculas. Uno que ya trae
 * minúsculas se respeta tal cual: quien lo escribió así lo escribió a
 * propósito.
 */
function titleCase(published: string): string {
  if (published !== published.toLocaleUpperCase('es')) return published;
  return published
    .toLocaleLowerCase('es')
    .split(/\s+/u)
    .map((word, index) => {
      const original = published.split(/\s+/u)[index] ?? word;
      if (!/[aeiouáéíóú]/iu.test(original)) return original;
      if (index > 0 && PARTICLES.has(word)) return word;
      return word.charAt(0).toLocaleUpperCase('es') + word.slice(1);
    })
    .join(' ');
}

/**
 * El nombre y el código con los que una empresa entra al corpus.
 *
 * Una sola función para las dos listas, porque el cruce entre ellas es
 * exactamente lo que se rompería si cada una normalizara por su cuenta. El
 * código sale siempre del nombre canónico y nunca del que se dibuja: dos
 * fuentes que escriban «BOA» y «Boa» tienen que dar el mismo código.
 */
export function canonicalCompany(published: string): { slug: string; name: string } {
  const alias = ALIASES[fullSlug(published)];
  if (alias === undefined) return { slug: companySlug(published), name: titleCase(published) };
  return { slug: companySlug(alias), name: alias };
}
