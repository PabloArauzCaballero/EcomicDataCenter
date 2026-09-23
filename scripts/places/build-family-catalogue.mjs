#!/usr/bin/env node
/**
 * Merges the two family catalogues the corpus has been classified with.
 *
 * Usage:
 *   node scripts/places/build-family-catalogue.mjs \
 *     --anexo-a <anexo-A-catalogo-actual-201-familias.csv> \
 *     --v3      <catalogo_subcategorias_lugares_bolivia.json> \
 *     --out     scripts/places/catalogue/bolivia-place-families.json \
 *     [--manual scripts/places/catalogue/bolivia-health-families-manual.json]
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
 * An optional third input, `--manual`, adds families that neither catalogue
 * defines. It exists because a later corpus can need a family nobody shipped
 * yet — the health sector's `POSTA_SANITARIA` and five others, added
 * 2026-09-23 — and inventing one by hand outside this tool would put it a
 * step ahead of the file that is supposed to be the single source. A manual
 * entry can only add a code neither source already has: reusing one of theirs
 * would be the reclassification this file exists to prevent, so the build
 * stops instead of silently overriding a decided family.
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
    manual: options.get('manual') ?? null,
    out: resolve(options.get('out')),
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

/** A hand-authored family, checked for the four fields a place record needs. */
function readManual(text) {
  const parsed = JSON.parse(text);
  const families = new Map();
  for (const entry of parsed.familias ?? []) {
    const code = (entry.code ?? '').trim();
    if (code.length === 0) continue;
    if (!entry.group || !entry.commercial_role || typeof entry.is_regulated !== 'boolean') {
      throw new Error(`manual family ${code} needs group, commercial_role and is_regulated`);
    }
    families.set(code, {
      code,
      group: entry.group,
      commercial_role: entry.commercial_role,
      is_regulated: entry.is_regulated,
      official_validation_source: stated(entry.official_validation_source),
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

async function main() {
  const options = readArguments(process.argv.slice(2));
  const annexBytes = await readFile(options.anexoA);
  const v3Bytes = await readFile(options.v3);
  const annex = readAnnex(annexBytes.toString('utf8'));
  const { families: v3, metadata: v3Metadata } = readV3(v3Bytes.toString('utf8'));
  const manualBytes = options.manual ? await readFile(options.manual) : null;
  const manual = manualBytes ? readManual(manualBytes.toString('utf8')) : new Map();

  const alreadyDecided = [...manual.keys()].filter((code) => annex.has(code) || v3.has(code));
  if (alreadyDecided.length > 0) {
    throw new Error(
      `--manual reclasifica familias que ya decide anexo_A_201 o catalogo_2330: ${alreadyDecided.join(', ')}`,
    );
  }

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
  for (const [code, family] of manual) {
    families.push({ ...family, decided_by: 'anotacion_manual_salud_2026-09-23' });
  }
  families.sort((one, other) => one.code.localeCompare(other.code));

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
      manual: options.manual
        ? {
            file: options.manual,
            sha256: createHash('sha256').update(manualBytes).digest('hex'),
            families: manual.size,
          }
        : null,
      /*
       * Las familias en las que el catalogo nuevo afirma menos que el anexo.
       * Se listan enteras porque son la unica parte de este archivo donde el
       * lector esta leyendo la afirmacion vieja habiendo otra mas reciente.
       */
      keptFromAnnexDespiteNewerClaim: weakened.sort(),
    },
    familias: families,
  };

  await mkdir(dirname(options.out), { recursive: true });
  await writeFile(options.out, `${JSON.stringify(document, null, 2)}\n`, 'utf8');

  process.stdout.write(`anexo A:                  ${annex.size} familias\n`);
  process.stdout.write(`catalogo de subcategorias:${String(v3.size).padStart(6)} familias\n`);
  process.stdout.write(`anotacion manual:         ${manual.size} familias\n`);
  process.stdout.write(`catalogo unido:           ${families.length} familias\n`);
  process.stdout.write(`  las decide el anexo A:  ${annex.size}\n`);
  process.stdout.write(`  el anexo afirma mas:    ${weakened.length}\n`);
  process.stdout.write(`escrito en ${options.out}\n`);
}

main().catch((error) => {
  process.stderr.write(`${error.message}\n`);
  process.exitCode = 1;
});
