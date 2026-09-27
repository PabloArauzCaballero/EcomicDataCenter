/**
 * Lo que el catalogo unido admite ademas de sus dos fuentes: altas de familias
 * que ninguna define y la familia padre de cada familia hija. Vive aparte de
 * `build-family-catalogue.mjs` para que la regla de precedencia entre el anexo
 * y el catalogo de 2.330 siga leyendose sola.
 */

/** Un campo vacio es un nulo, nunca un texto vacio. */
function stated(value) {
  const text = (value ?? '').toString().trim();
  return text.length > 0 ? text : null;
}

/**
 * Las familias nuevas, comprobadas una por una.
 *
 * Un `is_regulated` verdadero sin regulador nombrado se rechaza: diria que una
 * autoridad licencia la actividad sin decir cual, que es justo lo que el
 * catalogo existe para no hacer.
 */
export function readAdditions(text, known) {
  const parsed = JSON.parse(text);
  const decidedBy = stated(parsed.decidedBy);
  if (!decidedBy) throw new Error('el archivo de familias nuevas no dice quien las decide');
  const families = new Map();
  for (const entry of parsed.familias ?? []) {
    const code = (entry.code ?? '').trim();
    if (!/^[A-Z0-9_]{2,60}$/u.test(code)) throw new Error(`codigo de familia invalido: ${code}`);
    if (known.has(code) || families.has(code)) {
      throw new Error(`la familia ${code} ya esta definida; una alta no puede redefinirla`);
    }
    if (!stated(entry.group) || !stated(entry.commercial_role)) {
      throw new Error(`la familia ${code} no tiene group o commercial_role`);
    }
    const source = stated(entry.official_validation_source);
    if (entry.is_regulated === true && !source) {
      throw new Error(`la familia ${code} dice estar regulada sin nombrar al regulador`);
    }
    families.set(code, {
      code,
      group: entry.group.trim(),
      commercial_role: entry.commercial_role.trim(),
      is_regulated: entry.is_regulated === true,
      official_validation_source: source,
      decided_by: decidedBy,
    });
  }
  return families;
}

/**
 * El padre de cada familia, o nada.
 *
 * Una arista explicita manda sobre una regla. Un padre que no existe, una
 * familia que es su propio padre o un ciclo detienen la construccion: una
 * jerarquia rota agruparia lugares bajo un rubro que no se puede nombrar.
 */
export function resolveHierarchy(text, families) {
  const parsed = JSON.parse(text);
  const parents = new Map();
  for (const family of families.values()) {
    for (const rule of parsed.reglas ?? []) {
      if (
        family.code.endsWith(rule.sufijo) &&
        rule.grupos.includes(family.group) &&
        family.code !== rule.padre
      ) {
        parents.set(family.code, rule.padre);
        break;
      }
    }
  }
  for (const [child, parent] of Object.entries(parsed.aristas ?? {})) {
    if (!families.has(child))
      throw new Error(`la jerarquia nombra una familia que no existe: ${child}`);
    parents.set(child, parent);
  }
  for (const [child, parent] of parents) {
    if (!families.has(parent)) throw new Error(`${child} tiene por padre ${parent}, que no existe`);
    if (child === parent) throw new Error(`${child} no puede ser su propio padre`);
    const seen = new Set([child]);
    for (let up = parents.get(parent); up; up = parents.get(up)) {
      if (seen.has(up)) throw new Error(`la jerarquia tiene un ciclo en ${child}`);
      seen.add(up);
    }
  }
  return parents;
}
