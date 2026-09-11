/**
 * Reads the entity-family catalogue that classifies a place.
 *
 * The catalogue is the only thing that says which group a family belongs to,
 * what commercial role it plays, and whether a Bolivian regulator licenses the
 * activity. None of those three travel inside the place delivery, which ships
 * family codes and counts alone, so the catalogue is a required input and not
 * a default this module is willing to supply.
 *
 * Two shapes are accepted because two exist: the 201-family CSV the three-city
 * corpus was classified with, and the JSON the delivery contract defines, whose
 * entries carry the same five fields under the same names.
 */

import { readFile } from 'node:fs/promises';

/** A byte-order mark at the head of a CSV would hide inside the first column name. */
function stripByteOrderMark(text) {
  return text.charCodeAt(0) === 0xfeff ? text.slice(1) : text;
}

/**
 * One catalogue row, reduced to what a place record needs.
 *
 * `officialValidationSource` stays null when the catalogue leaves it empty:
 * naming a regulator that the catalogue does not name would tell a reader which
 * register confirms a place when nobody decided that it does.
 */
function toFamily(code, group, commercialRole, isRegulated, validationSource) {
  const source = (validationSource ?? '').trim();
  return {
    code,
    group,
    commercialRole,
    isRegulated,
    officialValidationSource: source.length > 0 ? source : null,
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

function readCsvCatalogue(text) {
  const lines = stripByteOrderMark(text)
    .split(/\r?\n/)
    .filter((line) => line.trim().length > 0);
  const header = parseCsvLine(lines[0]);
  const column = (name) => header.indexOf(name);
  const codeAt = column('code');
  const groupAt = column('group');
  const roleAt = column('commercial_role');
  const regulatedAt = column('is_regulated');
  const sourceAt = column('official_validation_source');
  if ([codeAt, groupAt, roleAt, regulatedAt].some((index) => index < 0)) {
    throw new Error('the catalogue CSV needs code, group, commercial_role and is_regulated');
  }

  const families = new Map();
  for (const line of lines.slice(1)) {
    const fields = parseCsvLine(line);
    const code = fields[codeAt].trim();
    if (code.length === 0) continue;
    families.set(
      code,
      toFamily(
        code,
        fields[groupAt].trim(),
        fields[roleAt].trim(),
        fields[regulatedAt].trim().toLowerCase() === 'true',
        sourceAt >= 0 ? fields[sourceAt] : null,
      ),
    );
  }
  return families;
}

function readJsonCatalogue(text) {
  const parsed = JSON.parse(text);
  const entries = Array.isArray(parsed) ? parsed : (parsed.familias ?? parsed.families ?? []);
  const families = new Map();
  for (const entry of entries) {
    const code = (entry.code ?? '').trim();
    if (code.length === 0) continue;
    families.set(
      code,
      toFamily(
        code,
        entry.group,
        entry.commercial_role ?? entry.commercialRole,
        entry.is_regulated === true || entry.isRegulated === true,
        entry.official_validation_source ?? entry.officialValidationSource ?? null,
      ),
    );
  }
  return families;
}

/** Reads whichever of the two shapes the operator pointed at. */
export async function readFamilyCatalogue(path) {
  const text = await readFile(path, 'utf8');
  const families = path.toLowerCase().endsWith('.csv')
    ? readCsvCatalogue(text)
    : readJsonCatalogue(text);
  if (families.size === 0) throw new Error(`the catalogue at ${path} defines no family`);
  for (const family of families.values()) {
    if (!family.group || !family.commercialRole) {
      throw new Error(`family ${family.code} has no group or no commercial role`);
    }
  }
  return families;
}
