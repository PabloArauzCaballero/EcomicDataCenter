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
  /*
   * Las trece ediciones de Merco, leídas de su web en septiembre de 2026.
   *
   * El monitor escribe a la misma empresa de dos o tres maneras según el año
   * —«PIL ANDINA» y «PIL ANDINA S.A.», «VIVA NOVATEL PCS» y «VIVA NUEVATEL
   * PCS»— y sin unificarlas la trayectoria de una empresa se parte en dos
   * líneas que empiezan y terminan donde cambió la razón social. Cuando la
   * empresa además exporta, la forma canónica es la del ránking aduanero,
   * para que el cruce la encuentre: «ACEITE FINO» y «FINO INDUSTRIAS DE
   * ACEITE» son Industrias de Aceite, la misma de la lista de Datasur. «IOL»
   * no se le suma aunque la sigla lo sugiera: Merco las puntúa por separado en
   * la misma edición de 2013 —vigésima y sexagésimo quinta—, así que son dos.
   */
  ACEITE_FINO_SA: 'Industrias de Aceite (IOL)',
  FINO_INDUSTRIAS_DE_ACEITE_SA: 'Industrias de Aceite (IOL)',
  FINO_INDUSTRIAS_DE_ACEITE_S_A: 'Industrias de Aceite (IOL)',
  IOL_SA: 'IOL',
  YPFB_CORPORACION: 'YPFB',
  COMIBOL: 'Comibol',
  OPERACIONES_METALURGICAS_OMSA: 'Operaciones Metalúrgicas',
  OPERACIONES_METALURGICAS: 'Operaciones Metalúrgicas',
  MINERA_MANQUIRI_SA: 'Empresa Minera Manquiri',
  GRAVETAL: 'Gravetal Bolivia',
  NUTRIOIL: 'Agroindustrial Nutrioil',
  CEIBO: 'El Ceibo',
  PANAMERICAN_SILVER: 'Pan American Silver Bolivia',
  MINERA_SINCHI_WAYRA: 'Sinchi Wayra',
  INGENIO_GUABIRA: 'Ingenio Azucarero Guabirá',
  AGUAI_SA_INGENIO_SUCROALCOHOLERO: 'Aguaí',
  AGUAI_SA_INGENIO_SUCRO_ALCOHOL: 'Aguaí',
  BOA_BOLIVIANA_DE_AVIACION: 'Boliviana de Aviación BOA',
  PIL_ANDINA_SA: 'PIL Andina',
  EMBOL_SA_COCA_COLA: 'Embol Coca-Cola',
  BANCO_DE_CREDITO: 'Banco de Crédito de Bolivia',
  BANCO_DE_CREDITO_BCP: 'Banco de Crédito de Bolivia',
  BANCO_MERCANTIL_SANTA_CRUZ: 'Banco Mercantil Santa Cruz',
  ADM_SAO: 'ADM SAO',
  ADM_SAO_SA: 'ADM SAO',
  ALIANZA_COMPANIA_DE_SEGUROS_Y_REASEGUROS: 'Alianza Compañía de Seguros y Reaseguros',
  ALIANZA_COMPANIA_DE_SEGUROS_Y_REASEGUROS_SA: 'Alianza Compañía de Seguros y Reaseguros',
  ALIANZA_SEGUROS: 'Alianza Compañía de Seguros y Reaseguros',
  ASTARA_OVANDO: 'Ovando',
  OVANDO_SA: 'Ovando',
  ASTRIX_SA: 'Astrix',
  BAGO: 'Laboratorios Bagó',
  BANCO_FIE_S_A: 'Banco FIE',
  BANCO_FIE: 'Banco FIE',
  FASSIL: 'Banco Fassil',
  BANCO_PRODEM: 'Banco Prodem',
  PRODEM: 'Banco Prodem',
  BATEBOL_SA: 'Batebol',
  BG_BOLIVIA: 'BG Bolivia',
  BRITISH_GAS_BG: 'BG Bolivia',
  CARLOS_CABALLERO_SRL: 'Carlos Caballero',
  CIACRUZ: 'La Boliviana Ciacruz',
  CITSA: 'CITSA',
  COMPANIA_INDUSTRIAL_DE_TABACOS_SA_CITSA: 'CITSA',
  COMPANIA_INDUSTRIAL_DE_TABACO_SA_CITSA: 'CITSA',
  CORPORACION_DILLMAN: 'Dillmann',
  CORPORACION_INDUSTRIAL_DILLMAN: 'Dillmann',
  CORPORACION_INDUSTRIAL_DILLMANN: 'Dillmann',
  CORPORACION_UNAGRO: 'Unagro',
  COTAS_LTDA: 'Cotas',
  COOPERATIVA_RURAL_DE_ELECTRIFICACION: 'CRE',
  CRE: 'CRE',
  ELFEC: 'ELFEC',
  EMPRESA_DE_LUZ_Y_FUERZA_ELECTRICA_COCHABAMBA_S_A_ELFEC: 'ELFEC',
  EMPRESA_FERROVIARIA_ORIENTAL_FO: 'Ferroviaria Oriental',
  FERROVIARIA_ORIENTAL_FO: 'Ferroviaria Oriental',
  ENDE: 'ENDE',
  ENDE_EMPREA_NACIONAL_DE_ELECTRICIDAD: 'ENDE',
  ENDE_EMPRESA_NACIONAL_DE_ELECTRICIDAD: 'ENDE',
  ENDE_EMPRESA_NACIONAL_DE_ELECTRICIDAD_BOLIVIA: 'ENDE',
  EMPRESA_DE_APOYO_A_LA_PRODUCCION_DE_ALIMENTOS_EMAPA: 'EMAPA',
  SUPERMERCADO_FIDALGA: 'Fidalga',
  FINNING: 'Finning Bolivia',
  GEO_GRUPO_EMPRESARIAL_DEL_ORIENTE: 'Grupo GEO',
  GRUPO_GEO: 'Grupo GEO',
  INDUSTRIA_VENADO: 'Grupo Venado',
  GRUPO_NACIONAL_VIDA: 'Nacional Vida',
  IMBA: 'IMBA',
  IMBA_SA: 'IMBA',
  ITACAMBA_CEMENTO_SA: 'Itacamba Cemento',
  MOLINO_ANDINO_LA_SUPREMA: 'La Suprema',
  PINTURAS_MONOPOL: 'Pinturas Monopol',
  MONOPOL: 'Pinturas Monopol',
  PROCTER_GAMBLE: 'Procter & Gamble',
  PROCTER_GAMBLE_P_G: 'Procter & Gamble',
  RED_UNITEL: 'Unitel',
  SOBOCE_SA: 'Soboce',
  TOYOSA_SA: 'Toyosa',
  TOYOSA_TOYOTA: 'Toyosa',
  UNIVERSIDAD_DEL_VALLE: 'Univalle',
  UNIVERSIDAD_DEL_VALLE_UNIVALLE: 'Univalle',
  VIVA_NOVATEL_PCS: 'Viva',
  VIVA_NUEVATEL_PCS: 'Viva',
  /*
   * Siglas con vocales y nombres que la regla de mayúsculas deja mal. No
   * cambian el código —el nombre canónico da el mismo—; sólo cómo se lee.
   */
  BPO_CENTER: 'BPO Center',
  IC_NORTE: 'IC Norte',
  PPO_ABOGADOS: 'PPO Abogados',
  UNIVERSIDAD_CATOLICA_BOLIVIANA_UCB: 'Universidad Católica Boliviana (UCB)',
  UNIVERSIDAD_PRIVADA_BOLIVIANA_UPB: 'Universidad Privada Boliviana (UPB)',
  UNIVERSIDAD_DE_AQUINO_BOLIVIA_UDABOL: 'Universidad de Aquino Bolivia (UDABOL)',
  GAS_Y_ELECTRICIDAD_S_A: 'Gas y Electricidad S.A.',
  HOTEL_LOS_TAJIBOS: 'Hotel Los Tajibos',
  HOTEL_CAMINO_REAL: 'Hotel Camino Real',
  NESTLE_BOLIVIA: 'Nestlé Bolivia',
  D_M: 'D&M',
  PWC: 'PwC',
  COTEL: 'COTEL',
  UTEPSA: 'UTEPSA',
  INFOCAL: 'INFOCAL',
  SACI: 'SACI',
  SAE: 'SAE',
  UNIFRANZ: 'Unifranz',
  RED_ATB: 'Red ATB',
  RED_PAT: 'Red PAT',
  MI_TELEFERICO: 'Mi Teleférico',
  EL_DEBER: 'El Deber',
  LA_CASCADA: 'La Cascada',
  LA_PAPELERA: 'La Papelera',
  LA_VITALICIA: 'La Vitalicia',
  LAS_BRISAS: 'Las Brisas',
  ESTROPICAL_COM: 'Estropical.com',
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
