import { folded } from './tax-geometry';

/**
 * La misma empresa escrita de cinco maneras en quince memorias.
 *
 * El SIN no normaliza las razones sociales entre ediciones: «EMBOTELLADORAS
 * BOLIVIANAS UNIDAS» (2014), «… UNIDAS - EMBOL S.A.» (2016) y «… UNIDAS S.A.
 * EMBOL» (2020) son la misma fila de un año a otro. Sin juntarlas, la serie de
 * una empresa se parte en tres y el tablero muestra tres empresas con huecos.
 *
 * Se juntan con dos reglas que no inventan nada: la clave de comparación es el
 * nombre sin formas societarias, sin puntuación ni espacios (así «S A» y «SA»,
 * o «BO- LIVIAN» partido en dos renglones, son lo mismo), y un nombre corto se
 * une a uno largo que empieza igual sólo si no hay otro largo distinto que
 * también empiece así: «YPFB» no se uniría a la vez con «YPFB ANDINA» y «YPFB
 * CHACO». Lo que no cumple eso queda separado aunque una persona lo uniría;
 * la tabla de equivalencias del corpus (`corporate-aliases`) es el lugar para
 * esos casos.
 */

const LEGAL_FORMS =
  /\b(?:SOCIEDAD DE RESPONSABILIDAD LIMITADA|SOCIEDAD ANONIMA(?: MIXTA)?|SUCURSAL(?: EN)? BOLIVIA|SUC\.? BOLIVIA|SUCURSAL|LIMITADA|LTDA\.?|S\.?\s?R\.?\s?L\.?|R\.?\s?L\.?|S\.?\s?A\.?(?:\s?[MU]\.?)?)(?=[\s,.)(-]|$)/gu;

/** El nombre reducido a lo que distingue a la empresa. */
export function nameKey(printed: string): string {
  return folded(printed)
    .replace(LEGAL_FORMS, ' ')
    .replace(/[^A-Z0-9]/gu, '');
}

/** Lo mínimo que tiene que medir una clave para unirse por su comienzo. */
const MIN_PREFIX = 12;

/**
 * Para cada nombre impreso, el nombre con que se publica su serie: el de la
 * edición más reciente de su grupo, que es como la empresa se llama hoy.
 */
export function canonicalNames(
  seen: readonly { name: string; year: number }[],
): Map<string, string> {
  const keys = [...new Set(seen.map((one) => nameKey(one.name)))].sort(
    (left, right) => right.length - left.length,
  );
  const parent = new Map(keys.map((key) => [key, key] as const));
  const root = (key: string): string => {
    let at = key;
    while (parent.get(at) !== at) at = parent.get(at) ?? at;
    return at;
  };
  for (const short of keys) {
    if (short.length < MIN_PREFIX) continue;
    const longer = keys.filter((key) => key !== short && key.startsWith(short));
    const groups = new Set(longer.map(root));
    const only = [...groups][0];
    if (groups.size === 1 && only) parent.set(root(short), only);
  }
  const latest = new Map<string, { name: string; year: number }>();
  for (const one of seen) {
    const group = root(nameKey(one.name));
    const current = latest.get(group);
    if (!current || one.year >= current.year) latest.set(group, one);
  }
  return new Map(
    seen.map((one) => [one.name, latest.get(root(nameKey(one.name)))?.name ?? one.name]),
  );
}
