/**
 * Lectores de las entradas que `build-family-catalogue.mjs` fusiona.
 *
 * Separado del orquestador el 2026-09-23, al fusionar cuatro ramas que
 * añadieron cada una su propia entrada opcional (`--manual`, `--observatorio`,
 * `--additions`, `--hierarchy`): juntas pasaban las 300 líneas del límite del
 * repo. Aquí van solo los lectores puros — parsear el CSV, el JSON del anexo,
 * el de la entrega y el que anotó a mano el observatorio — y el orquestador
 * se queda con la lógica de fusión, que es la que cambia si una regla cambia.
 */

import { createHash } from 'node:crypto';
import { readFile } from 'node:fs/promises';

export function parseCsvLine(line) {
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
export function stated(value) {
  const text = (value ?? '').toString().trim();
  return text.length > 0 ? text : null;
}

export function readAnnex(text) {
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
export function readManual(text) {
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

export function readV3(text) {
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
 * Las familias que decidio el observatorio, con quien y cuando lo decidio.
 *
 * Cada una trae el mismo par de afirmaciones que los catalogos —si un
 * regulador licencia la actividad y cual— y ademas la razon escrita, porque
 * aqui no hay un tercero detras de la respuesta.
 */
export async function readObservatory(path) {
  const bytes = await readFile(path);
  const parsed = JSON.parse(bytes.toString('utf8'));
  const decidedBy = parsed.metadata?.decided_by;
  if (!decidedBy) throw new Error(`${path} no dice quien decidio sus familias`);
  const families = (parsed.familias ?? []).map((entry) => {
    if (!entry.code || !entry.group || !entry.commercial_role || !entry.rationale) {
      throw new Error(`familia incompleta en ${path}: ${entry.code ?? '(sin codigo)'}`);
    }
    return {
      code: entry.code,
      group: entry.group,
      commercial_role: entry.commercial_role,
      is_regulated: entry.is_regulated === true,
      official_validation_source: stated(entry.official_validation_source),
    };
  });
  return { families, decidedBy, sha256: createHash('sha256').update(bytes).digest('hex') };
}
