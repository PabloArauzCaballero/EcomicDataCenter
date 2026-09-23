/**
 * Lo que el corpus nacional de lugares admite para las fuentes oficiales.
 *
 * Tres fuentes entraron el 2026-09-23 con una forma que ninguna entrega
 * anterior tenia: el registro de unidades educativas del Ministerio de
 * Educacion (SIE), la lista de estaciones de servicio licenciadas por la
 * Agencia Nacional de Hidrocarburos y un directorio privado de cajeros de
 * Santa Cruz. Viven aqui y no dentro del esquema para que el esquema no siga
 * creciendo por cada publicador que se sume.
 */

/**
 * Quien publica.
 *
 * Los dos primeros son reguladores: el ministerio registra cada unidad
 * educativa con su codigo R.U.E. y la ANH licencia cada estacion. El tercero
 * no lo es: Tel.bo publica un mapa de cajeros sin fecha de actualizacion y sin
 * que ningun banco ni ASFI respalde la lista, y por eso se nombra por su
 * nombre en vez de pasar por fuente financiera.
 */
export const OFFICIAL_PUBLISHERS = ['Ministerio de Educacion (SIE)', 'ANH', 'Tel.bo'] as const;

/**
 * Los identificadores que esas fuentes permiten.
 *
 * El R.U.E. es el codigo que el ministerio asigna a cada institucion. De la
 * ANH se guarda el codigo de operador y de establecimiento —`ANH01986-CLES01`—
 * y no la licencia entera, porque la licencia se renueva cada ano
 * (`LIC09/2026`) y la estacion sigue siendo la misma. El directorio de cajeros
 * no numera nada: su identificador sale del contenido de la fila.
 */
export const OFFICIAL_PLACE_IDENTIFIER =
  /^(?:sie:rue:\d{6,10}|anh:estacion:ANH\d{3,8}-[A-Z]{2,8}\d{1,4}|tel_bo:cajero:[0-9a-f]{24})$/u;

/**
 * Como se clasifico.
 *
 * El regulador escribe la actividad en su propio registro —el subsistema del
 * ministerio, la actividad licenciada por la ANH—, que es la clasificacion mas
 * firme del corpus. Un directorio privado dice de que banco es un cajero, y
 * eso no lo confirma ni el banco ni el supervisor.
 */
export const OFFICIAL_CLASSIFICATION_METHODS = [
  'actividad_declarada_por_el_regulador_en_su_registro',
  'actividad_declarada_por_un_directorio_privado',
] as const;

/** Un punto que un tercero puso en su mapa, sin decir como. */
export const OFFICIAL_POSITION_METHODS = [
  'coordenada_publicada_por_un_directorio_privado_no_entrada_verificada',
] as const;

/**
 * Un registro de regulador que no es sanitario, o un directorio privado.
 *
 * El primero nombra el establecimiento, la direccion declarada y el acto que
 * lo autoriza —el R.U.E., la licencia—, y no dice que siga abierto hoy. El
 * segundo es lo que trae el directorio de cajeros: nombre de banco, sucursal y
 * direccion, sin que ningun regulador ni el propio banco lo respalden.
 */
export const OFFICIAL_DATA_LEVELS = [
  'REGISTRO_DEL_REGULADOR_DIRECCION_DECLARADA',
  'DIRECTORIO_PRIVADO_DIRECCION_DECLARADA',
] as const;

/**
 * El departamento declarado, cotejado con las escuelas mas cercanas.
 *
 * La ANH publica departamento y no municipio, y el directorio de cajeros no
 * publica ni eso. No hay poligonos en el repositorio, asi que el unico cotejo
 * posible es que las unidades educativas mas cercanas —que si declaran
 * departamento— esten en el mismo.
 */
export const OFFICIAL_GEOFENCE_METHODS = ['declared_department'] as const;
