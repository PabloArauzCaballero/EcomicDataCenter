#!/usr/bin/env node
/**
 * Merges the two family catalogues the corpus has been classified with.
 *
 * Usage:
 *   node scripts/places/build-family-catalogue.mjs \
 *     --anexo-a <anexo-A-catalogo-actual-201-familias.csv> \
 *     --v3      <catalogo_subcategorias_lugares_bolivia.json> \
 *     --out     scripts/places/catalogue/bolivia-place-families.json \
 *     [--additions scripts/places/catalogue/osm-expansion-families.json] \
 *     [--hierarchy scripts/places/catalogue/family-hierarchy.json]
 *
 * Two catalogues exist and they do not say the same thing. The 201-family
 * annex classified everything the observatory holds today; the 2.330-family
 * catalogue that arrived on 2026-09-21 defines the 424 families the national
 * corpus was waiting for, plus the 11 of the expansion.
 *
 * Where both define a family they agree on `group` and on `commercial_role` —
 * 201 of 201, checked — and they disagree on `is_regulated` in 63 of them. The
 * newer one almost always says false where the older said true, and it says in
 * its own notes what that false means: «ausencia de una exigencia sectorial
 * suficientemente documentada en esta entrega, no exención legal ni actividad
 * desregulada». So it is not a correction. It is a weaker claim made under a
 * stricter evidence rule.
 *
 * The older claim wins for the families the older catalogue defines, for a
 * reason that has nothing to do with which is better: those rows are already
 * loaded, the corpus is immutable, and the loader is idempotent by payload
 * hash. Reclassifying a family would not change the row that is in the
 * database — it would add a second one beside it, and the report would count
 * every one of those places twice. The newer catalogue therefore fills what
 * nothing had classified, and touches nothing that anybody already answered.
 *
 * The output carries `decided_by` on every family so that anyone reading a
 * place's `is_regulated` can see which of the two catalogues decided it.
 *
 * Dos entradas mas, las dos opcionales y versionadas junto al catalogo:
 *
 *  - `--additions`: familias que ningun catalogo define y que una carga nueva
 *    necesita. Solo anaden: una familia que ya define el anexo o el catalogo de
 *    2.330 detiene la construccion, porque redefinirla cambiaria el
 *    `is_regulated` de filas ya cargadas, y eso no se corrige, se duplica.
 *  - `--hierarchy`: la familia padre de cada familia hija, por reglas de sufijo
 *    y grupo y por aristas explicitas. Se escribe como `parent_family` y es
 *    metadato puro: ningun constructor lo copia a una fila y el cargador no lee
 *    este archivo, asi que no mueve la huella de ningun payload ya cargado.
 *
 * Las familias salen ordenadas por codigo. Quien fusione ramas que anadieron
 * familias por separado debe regenerar con todas sus entradas, no fusionar el
 * JSON a mano.
 */

import { createHash } from 'node:crypto';
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { dirname, resolve } from 'node:path';

function readArguments(argv) {
  const options = new Map();
  for (let index = 0; index < argv.length; index += 2) {
    if (!argv[index].startsWith('--')) throw new Error(`unexpected argument ${argv[index]}`);
    options.set(argv[index].slice(2), argv[index + 1]);
  }
  for (const required of ['anexo-a', 'v3', 'out']) {
    if (!options.get(required)) throw new Error(`--${required} is required`);
  }
  return {
    anexoA: options.get('anexo-a'),
    v3: options.get('v3'),
    out: resolve(options.get('out')),
    additions: options.get('additions') ?? null,
    hierarchy: options.get('hierarchy') ?? null,
  };
}

function parseCsvLine(line) {
  const fields = [];
  let field = '';
  let quoted = false;
  for (let index = 0; index < line.length; index += 1) {
    const character = line[index];
    if (quoted && character === '"' && line[index + 1] === '"') {
      field += '"';
      index += 1;
    } else if (character === '"') {
      quoted = !quoted;
    } else if (character === ',' && !quoted) {
      fields.push(field);
      field = '';
    } else {
      field += character;
    }
  }
  fields.push(field);
  return fields;
}

/** A field the catalogue left empty is a null, never an empty string. */
function stated(value) {
  const text = (value ?? '').toString().trim();
  return text.length > 0 ? text : null;
}

function readAnnex(text) {
  const lines = (text.charCodeAt(0) === 0xfeff ? text.slice(1) : text)
    .split(/\r?\n/u)
    .filter((line) => line.trim().length > 0);
  const header = parseCsvLine(lines[0]);
  const at = (name) => header.indexOf(name);
  const families = new Map();
  for (const line of lines.slice(1)) {
    const fields = parseCsvLine(line);
    const code = fields[at('code')].trim();
    if (code.length === 0) continue;
    families.set(code, {
      code,
      group: fields[at('group')].trim(),
      commercial_role: fields[at('commercial_role')].trim(),
      is_regulated: fields[at('is_regulated')].trim().toLowerCase() === 'true',
      official_validation_source: stated(fields[at('official_validation_source')]),
    });
  }
  return families;
}

function readV3(text) {
  const parsed = JSON.parse(text);
  const families = new Map();
  for (const entry of parsed.familias ?? []) {
    const code = (entry.code ?? '').trim();
    if (code.length === 0) continue;
    families.set(code, {
      code,
      group: entry.group,
      commercial_role: entry.commercial_role,
      is_regulated: entry.is_regulated === true,
      official_validation_source: stated(entry.official_validation_source),
    });
  }
  return { families, metadata: parsed.metadata ?? {} };
}

/**
 * Las familias nuevas, comprobadas una por una.
 *
 * Un `is_regulated` verdadero sin regulador nombrado se rechaza: diria que una
 * autoridad licencia la actividad sin decir cual, que es justo lo que el
 * catalogo existe para no hacer.
 */
function readAdditions(text, known) {
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
function resolveHierarchy(text, families) {
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

async function main() {
  const options = readArguments(process.argv.slice(2));
  const annexBytes = await readFile(options.anexoA);
  const v3Bytes = await readFile(options.v3);
  const annex = readAnnex(annexBytes.toString('utf8'));
  const { families: v3, metadata: v3Metadata } = readV3(v3Bytes.toString('utf8'));

  /*
   * Una discrepancia en `group` o en `commercial_role` no se resuelve sola:
   * significaria que las dos taxonomias no son la misma taxonomia, y entonces
   * mezclarlas pondria dos vocabularios en la misma columna. Se comprueba aqui
   * en vez de confiar en que sigan coincidiendo en la siguiente entrega.
   */
  const conflicting = [];
  const weakened = [];
  for (const [code, older] of annex) {
    const newer = v3.get(code);
    if (!newer) continue;
    if (older.group !== newer.group || older.commercial_role !== newer.commercial_role) {
      conflicting.push(code);
    }
    if (
      older.is_regulated !== newer.is_regulated ||
      older.official_validation_source !== newer.official_validation_source
    ) {
      weakened.push(code);
    }
  }
  if (conflicting.length > 0) {
    throw new Error(
      `los dos catalogos clasifican distinto en group o commercial_role: ${conflicting.join(', ')}`,
    );
  }

  const families = [];
  for (const [code, family] of v3) {
    const older = annex.get(code);
    families.push({ ...(older ?? family), decided_by: older ? 'anexo_A_201' : 'catalogo_2330' });
  }
  for (const [code, family] of annex) {
    if (!v3.has(code)) families.push({ ...family, decided_by: 'anexo_A_201' });
  }

  const additionsBytes = options.additions ? await readFile(options.additions) : null;
  const additions = additionsBytes
    ? readAdditions(additionsBytes.toString('utf8'), new Set(families.map((one) => one.code)))
    : new Map();
  families.push(...additions.values());
  families.sort((one, other) => one.code.localeCompare(other.code));

  const hierarchyBytes = options.hierarchy ? await readFile(options.hierarchy) : null;
  const parents = hierarchyBytes
    ? resolveHierarchy(
        hierarchyBytes.toString('utf8'),
        new Map(families.map((one) => [one.code, one])),
      )
    : new Map();
  for (const family of families) {
    const parent = parents.get(family.code);
    if (parent) family.parent_family = parent;
  }

  const document = {
    metadata: {
      dataset: 'CATALOGO_FAMILIAS_DE_LUGARES_BOLIVIA',
      built: new Date().toISOString().slice(0, 10),
      families: families.length,
      precedence:
        'anexo_A_201 decide las familias que define; el catalogo de 2.330 rellena el resto',
      precedenceReason:
        'las filas clasificadas con el anexo A ya estan cargadas y el corpus es inmutable: ' +
        'reclasificar una familia no cambiaria esas filas, anadiria una segunda al lado',
      annex: {
        file: 'anexo-A-catalogo-actual-201-familias.csv',
        sha256: createHash('sha256').update(annexBytes).digest('hex'),
        families: annex.size,
      },
      catalogue2330: {
        file: 'catalogo_subcategorias_lugares_bolivia.json',
        sha256: createHash('sha256').update(v3Bytes).digest('hex'),
        version: v3Metadata.version ?? null,
        date: v3Metadata.fecha ?? null,
        families: v3.size,
        baseTaxonomy: v3Metadata.base_taxonomy_citation?.url ?? null,
        overtureRelease: v3Metadata.base_release_overture ?? null,
      },
      /*
       * Las familias en las que el catalogo nuevo afirma menos que el anexo.
       * Se listan enteras porque son la unica parte de este archivo donde el
       * lector esta leyendo la afirmacion vieja habiendo otra mas reciente.
       */
      keptFromAnnexDespiteNewerClaim: weakened.sort(),
      ...(additionsBytes
        ? {
            additions: {
              file: 'osm-expansion-families.json',
              sha256: createHash('sha256').update(additionsBytes).digest('hex'),
              families: additions.size,
            },
          }
        : {}),
      ...(hierarchyBytes
        ? {
            hierarchy: {
              file: 'family-hierarchy.json',
              sha256: createHash('sha256').update(hierarchyBytes).digest('hex'),
              familiesWithParent: parents.size,
            },
          }
        : {}),
    },
    familias: families,
  };

  await mkdir(dirname(options.out), { recursive: true });
  await writeFile(options.out, `${JSON.stringify(document, null, 2)}\n`, 'utf8');

  process.stdout.write(`anexo A:                  ${annex.size} familias\n`);
  process.stdout.write(`catalogo de subcategorias:${String(v3.size).padStart(6)} familias\n`);
  process.stdout.write(`catalogo unido:           ${families.length} familias\n`);
  process.stdout.write(`  las decide el anexo A:  ${annex.size}\n`);
  process.stdout.write(`  el anexo afirma mas:    ${weakened.length}\n`);
  process.stdout.write(`escrito en ${options.out}\n`);
}

main().catch((error) => {
  process.stderr.write(`${error.message}\n`);
  process.exitCode = 1;
});
